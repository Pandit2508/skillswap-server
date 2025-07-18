import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "./db.js";
import jwt from "jsonwebtoken";

// Setup Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
      passReqToCallback: true, // allow access to res in callback
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;

        // Check if user exists
        let userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        let user;

        if (userRes.rows.length === 0) {
          const newUserRes = await pool.query(
            "INSERT INTO users (name, email, is_google) VALUES ($1, $2, $3) RETURNING *",
            [name, email, true]
          );
          user = newUserRes.rows[0];
        } else {
          user = userRes.rows[0];
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// Used for session support (optional if only using cookies)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, userRes.rows[0]);
  } catch (err) {
    done(err, null);
  }
});
