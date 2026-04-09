router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL}/login`,
    session: false,
  }),
  (req, res) => {
    console.log("✅ GOOGLE CALLBACK HIT");
    console.log("USER FROM GOOGLE:", req.user);

    try {
      const isProd = process.env.NODE_ENV === "production";

      const token = jwt.sign(
        { id: req.user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "2d" }
      );

      // prevent caching
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");

      // cookie config
      res.cookie("token", token, {
        httpOnly: true,
        sameSite: isProd ? "None" : "Lax",
        secure: isProd,
        path: "/",
        maxAge: 2 * 24 * 60 * 60 * 1000,
      });

      // ✅ redirect to frontend (PRODUCTION SAFE)
      return res.redirect(`${process.env.CLIENT_URL}/google-redirect`);
    } catch (err) {
      console.error("Google OAuth error:", err);
      return res.redirect(`${process.env.CLIENT_URL}/login`);
    }
  }
);