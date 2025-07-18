import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import transporter from "../utils/emailTransporter.js";

// Helper: Generate JWT
const generateToken = (userId, expiresIn = process.env.JWT_EXPIRES_IN || "3d") => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn });
};

// SIGNUP
export const signup = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUserRes = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, hashedPassword]
    );

    const user = newUserRes.rows[0];
    const token = generateToken(user.id);

    // Send JWT as cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    });

    res.status(201).json({ message: "Signup successful", user });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// LOGIN
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user.id);
    const cleanUser = { id: user.id, name: user.name, email: user.email };

    // Send JWT as cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    });
    console.log(req.headers.cookie);
    res.status(200).json({ message: "Login successful", user: cleanUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// LOGOUT
export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  });
  
  res.status(200).json({ message: "Logged out successfully" });
};

// FORGOT PASSWORD
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];
    const token = generateToken(user.id, "15m");
    const resetLink = `http://localhost:3000/reset-password/${token}`; // ⚠️ Update domain in production

    await transporter.sendMail({
      from: `"SkillSwap Support" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Reset Your SkillSwap Password",
      html: `
        <p>Hi ${user.name},</p>
        <p>You requested a password reset for your SkillSwap account.</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetLink}" style="color:#7c3aed;">Reset Password</a></p>
        <p>This link will expire in 15 minutes.</p>
        <br />
        <p>If you didn't request this, you can safely ignore this email.</p>
      `
    });

    res.status(200).json({ message: "Reset email sent successfully" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// RESET PASSWORD
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in DB
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [hashedPassword, userId]
    );

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("❌ Reset password error:", err);

    if (err.name === "TokenExpiredError") {
      return res.status(400).json({ message: "Reset link expired" });
    }

    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

