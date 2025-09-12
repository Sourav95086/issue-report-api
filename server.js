const express = require("express");
const mysql = require("mysql2");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.json());
app.use(cors());

// Supabase config

const SUPABASE_URL = "https://hicytuqdzaoqcgfvlssv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpY3l0dXFkemFvcWNnZnZsc3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkyMTY1MSwiZXhwIjoyMDcyNDk3NjUxfQ.5A_rpKjAEeR0zQ71qHHXjvLnKU3Y_vscewiFd_GpYlU";
const SUPABASE_BUCKET = "issues";

// MySQL connection
const database = mysql.createConnection({
  user: "root",
  host: "localhost",
  database: "civic",
  password: "Sourav(890)"
});

database.connect(err => {
  if (err) console.log("❌ Error connecting to DB:", err);
  else console.log("✅ MySQL connected");
});

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    // ✅ Sanitize filename: replace spaces with underscores
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  }
});
const upload = multer({ storage });

// Upload file to Supabase
async function uploadToSupabase(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
      "content-disposition": "inline"
    },
    body: fileBuffer
  });

  if (!response.ok) {
    throw new Error("Upload failed: " + (await response.text()));
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
}

// API endpoint
app.post("/ReportIssue", upload.single("image"), async (req, res) => {
  try {
    const { firebaseId, category, description, city, state, country, locality } = req.body;
    if (!firebaseId || !category || !req.file) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const fileName = req.file.filename;
    const imageUrl = await uploadToSupabase(req.file.path, fileName);

    // Insert into MySQL
    const query = `
      INSERT INTO issues
      (firebaseId, category, description, imageUrl, city, state, country, locality)
      VALUES (?,?,?,?,?,?,?,?)
    `;
    database.query(query, [firebaseId, category, description || "", imageUrl, city, state, country, locality], (err, result) => {
      if (err) {
        console.error("❌ MySQL insert error:", err);
        return res.status(500).json({ error: "Database insert failed" });
      }

      // Delete temp file
      fs.unlinkSync(req.file.path);

      res.status(200).json({
        message: "✅ Issue reported successfully",
        issueId: result.insertId,
        imageUrl
      });
    });

  } catch (err) {
    console.error("❌ API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = 1000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
