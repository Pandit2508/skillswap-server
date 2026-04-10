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
        console.log("🔥 GOOGLE PROFILE:", profile);

        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;

        // ❌ No email → reject
        if (!email) {
          console.error("❌ No email from Google profile");
          return done(new Error("Google account has no email"), null);
        }

        // 🔎 Check existing user
        const userRes = await pool.query(
          "SELECT id, name, email FROM users WHERE email = $1",
          [email]
        );

        let user;

        if (userRes.rows.length === 0) {
          console.log("🆕 Creating new Google user");

          const newUserRes = await pool.query(
            `INSERT INTO users (name, email, is_google)
             VALUES ($1, $2, $3)
             RETURNING id, name, email`,
            [name, email, true]
          );

          user = newUserRes.rows[0];
        } else {
          console.log("✅ Existing user found");
          user = userRes.rows[0];
        }

        // ❌ Safety check (this saves you from silent crashes)
        if (!user || !user.id) {
          console.error("❌ Invalid user object:", user);
          return done(new Error("User creation failed"), null);
        }

        // ✅ SUCCESS
        return done(null, user);
      } catch (err) {
        console.error("💥 Google Strategy Error FULL:", err);
        return done(err, null);
      }
    }
  )
);