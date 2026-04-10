import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import transporter from "../utils/emailTransporter.js";

/* ================= HELPERS ================= */
const generateToken = (userId, expiresIn = process.env.JWT_EXPIRES_IN || "3d") => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn });
};

/* ================= COOKIE CONFIG ================= */
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  path: "/",
  maxAge: 3 * 24 * 60 * 60 * 1000,
};

/* ================= SIGNUP ================= */
export const signup = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

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

    res.cookie("token", token, cookieOptions);

    return res.status(201).json({
      message: "Signup successful",
      user,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user.id);

    const cleanUser = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    res.cookie("token", token, cookieOptions);

    return res.status(200).json({
      message: "Login successful",
      user: cleanUser,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/* ================= GET CURRENT USER (FIXED) ================= */
export const getMe = async (req, res) => {
  try {
    const token = req.cookies?.token;

    // 🔥 Fix: no token → don't crash
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      user: userRes.rows[0],
    });

  } catch (err) {
    console.error("getMe error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/* ================= LOGOUT ================= */
export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  });

  return res.status(200).json({
    message: "Logged out successfully",
  });
};

/* ================= FORGOT PASSWORD ================= */
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const userRes = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];
    const token = generateToken(user.id, "15m");

    const resetLink = `${process.env.CLIENT_URL}/reset-password/${token}`;

    await transporter.sendMail({
      from: `"SkillSwap Support" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Reset Your SkillSwap Password",
      html: `
        <p>Hi ${user.name},</p>
        <p>Click below to reset your password:</p>
        <a href="${resetLink}">Reset Password</a>
        <p>This link expires in 15 minutes.</p>
      `,
    });

    return res.status(200).json({
      message: "Reset email sent successfully",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= RESET PASSWORD ================= */
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [hashedPassword, decoded.id]
    );

    return res.status(200).json({
      message: "Password reset successful",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};