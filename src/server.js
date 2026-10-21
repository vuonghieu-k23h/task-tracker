
const express = require("express");
const path = require("path");
const pool = require("./db");
 const {
  redisClient,
  connectRedis,
  clearTasksCache
} = require("./redis");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// Kiểm tra web server
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Task Tracker dang hoat dong"
  });
});
// Lay danh sach cong viec voi Redis Cache
app.get("/api/tasks", async (req, res) => {
  const cacheKey = "tasks:all";

  try {
    // Kiem tra Redis Cache
    if (redisClient.isReady) {
      try {
        const cachedData = await redisClient.get(cacheKey);

        if (cachedData !== null) {
          console.log("CACHE HIT - Lay du lieu tu Redis");
          res.set("X-Cache", "HIT");
          return res.json(JSON.parse(cachedData));
        }
      } catch (error) {
        console.error("Loi doc Redis:", error.message);
      }
    }

    // Neu khong co cache, doc PostgreSQL
    console.log("CACHE MISS - Truy van PostgreSQL");

    const result = await pool.query(
      "SELECT * FROM tasks ORDER BY id ASC"
    );

    // Luu Redis trong 60 giay
    if (redisClient.isReady) {
      try {
        await redisClient.set(
          cacheKey,
          JSON.stringify(result.rows),
          { EX: 60 }
        );
      } catch (error) {
        console.error("Loi ghi Redis:", error.message);
      }
    }

    res.set("X-Cache", "MISS");
    res.json(result.rows);

  } catch (error) {
    console.error("Loi truy van tasks:", error.message);
    res.status(500).json({
      error: "Khong the tai danh sach cong viec"
    });
  }
});
// Kiểm tra kết nối PostgreSQL khi khởi động
async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("Ket noi PostgreSQL thanh cong!");

    await connectRedis();
    await pool.query("SELECT 1");
    console.log("Ket noi PostgreSQL thanh cong!");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Task Tracker dang chay tai http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Khong the ket noi PostgreSQL:",
      error.message
    );
    process.exit(1);
  }
}

startServer();
// Cac trang thai hop le cua cong viec
  const validStatuses = ["TODO", "IN_PROGRESS", "DONE"];
// Thêm công việc
app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description, deadline, status = "TODO" } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Tieu de khong hop le" });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Trang thai khong hop le" });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, description, deadline, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title.trim(), description || "", deadline || null, status]
    );
    await clearTasksCache();
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Khong the them cong viec" });
  }
});

// Cập nhật công việc
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, deadline, status } = req.body;

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID khong hop le" });
    }
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Tieu de khong hop le" });
    }
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Trang thai khong hop le" });
    }

    const result = await pool.query(
      `UPDATE tasks
       SET title=$1, description=$2, deadline=$3, status=$4
       WHERE id=$5 RETURNING *`,
      [title.trim(), description || "", deadline || null, status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Khong tim thay cong viec" });
    }

    await clearTasksCache();
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Khong the cap nhat cong viec" });
  }
});

// Xóa công việc
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID khong hop le" });
    }

    const result = await pool.query(
      "DELETE FROM tasks WHERE id=$1 RETURNING id",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Khong tim thay cong viec" });
    }

    await clearTasksCache();
    res.json({ message: "Da xoa cong viec", id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Khong the xoa cong viec" });
  }
});
