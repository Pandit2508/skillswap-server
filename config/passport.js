import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "./db.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;

        if (!email) {
          return done(new Error("Google account has no email"), null);
        }

        const userRes = await pool.query(
          "SELECT id, name, email FROM users WHERE email = $1",
          [email]
        );

        let user;

        if (userRes.rows.length === 0) {
          const newUserRes = await pool.query(
            `INSERT INTO users (name, email, is_google)
             VALUES ($1, $2, $3)
             RETURNING id, name, email`,
            [name, email, true]
          );

          user = newUserRes.rows[0];
        } else {
          user = userRes.rows[0];
        }

        if (!user || !user.id) {
          return done(new Error("User creation failed"), null);
        }

        return done(null, user);
      } catch (err) {
        console.error("Google OAuth strategy error:", err);
        return done(err, null);
      }
    }
  )
);