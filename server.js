// =======================
//  Imports & Setup
// =======================
const express = require("express");
const mysql   = require("mysql2");
const multer  = require("multer");
const fs      = require("fs");
const path    = require("path");
const cors    = require("cors");
const fetch   = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -----------------------
//  Supabase Config
// -----------------------
const SUPABASE_URL    = "https://hicytuqdzaoqcgfvlssv.supabase.co";
const SUPABASE_KEY    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpY3l0dXFkemFvcWNnZnZsc3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkyMTY1MSwiZXhwIjoyMDcyNDk3NjUxfQ.5A_rpKjAEeR0zQ71qHHXjvLnKU3Y_vscewiFd_GpYlU"; // ← put in .env in production!
const SUPABASE_BUCKET = "issues";

// -----------------------
//  MySQL Pool Connection
// -----------------------
const pool = mysql.createPool({
  host             : "sql12.freesqldatabase.com",
  user             : "sql12798326",
  password         : "MIBIVNPB4G",
  database         : "sql12798326",
  port             : 3306,
  waitForConnections: true,
  connectionLimit  : 10,
  queueLimit       : 0
});

pool.on("error", err => {
  console.error("❌ MySQL pool error:", err);
});

console.log("✅ MySQL pool ready");

// -----------------------
//  Uploads folder
// -----------------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// -----------------------
//  Multer Setup
// -----------------------
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename   : (_, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  }
});
const upload = multer({ storage });

// -----------------------
//  Helper: Upload to Supabase
// -----------------------
async function uploadToSupabase(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`,
    {
      method: "PUT",
      headers: {
        "Authorization"       : `Bearer ${SUPABASE_KEY}`,
        "Content-Type"        : "application/octet-stream",
        "x-upsert"            : "true",
        "content-disposition" : "inline"
      },
      body: fileBuffer
    }
  );

  if (!response.ok) {
    throw new Error("Upload failed: " + (await response.text()));
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
}

// =======================
//  API: ReportIssue
// =======================
app.post("/ReportIssue", upload.single("image"), async (req, res) => {
  try {
    const { firebaseId, category, description, city, state, country, locality } = req.body;

    if (!firebaseId || !category || !req.file) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Upload image to Supabase
    const fileName = req.file.filename;
    const imageUrl = await uploadToSupabase(req.file.path, fileName);

    // Insert record into MySQL using the pool
    const insertQuery = `
      INSERT INTO issues
      (firebaseId, category, description, imageUrl, city, state, country, locality)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    pool.query(
      insertQuery,
      [
        firebaseId,
        category,
        description || "",
        imageUrl,
        city || "",
        state || "",
        country || "",
        locality || ""
      ],
      (err, result) => {
        // remove temp file regardless of success/failure
        fs.unlinkSync(req.file.path);

        if (err) {
          console.error("❌ MySQL insert error:", err);
          return res.status(500).json({ error: "Database insert failed" });
        }

        res.status(200).json({
          message : "✅ Issue reported successfully",
          issueId : result.insertId,
          imageUrl
        });
      }
    );
  } catch (error) {
    console.error("❌ API error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =======================
//  Start Server
// =======================
const PORT = process.env.PORT || 1000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
