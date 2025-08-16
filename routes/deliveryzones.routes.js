const express = require("express");
const router = express.Router();
const pool = require("../db");

// ─────────────────── Create new zone ───────────────────
router.post("/", async (req, res) => {
  try {
    let { name, latitude, longitude, radius_km } = req.body;

    if (!name || latitude === undefined || longitude === undefined || radius_km === undefined) {
      return res.status(400).json({ msg: "Missing fields" });
    }

    latitude = parseFloat(latitude);
    longitude = parseFloat(longitude);
    radius_km = parseFloat(radius_km);

    if (isNaN(latitude) || isNaN(longitude) || isNaN(radius_km)) {
      return res.status(400).json({ msg: "Latitude, Longitude, and Radius must be numbers" });
    }

    const [result] = await pool.query(
      `INSERT INTO delivery_zones (name, latitude, longitude, radius_km) VALUES (?, ?, ?, ?)`,
      [name.trim(), latitude, longitude, radius_km]
    );

    res.json({ id: result.insertId, name, latitude, longitude, radius_km });
  } catch (err) {
    console.error("Error saving delivery zone:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────── List all zones ───────────────────
router.get("/", async (req, res) => {
  try {
    const [zones] = await pool.query(`SELECT * FROM delivery_zones ORDER BY id DESC`);
    res.json(zones);
  } catch (err) {
    console.error("Error fetching delivery zones:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────── Update a zone ───────────────────
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let { name, latitude, longitude, radius_km } = req.body;

    if (!name || latitude === undefined || longitude === undefined || radius_km === undefined) {
      return res.status(400).json({ msg: "Missing fields" });
    }

    latitude = parseFloat(latitude);
    longitude = parseFloat(longitude);
    radius_km = parseFloat(radius_km);

    if (isNaN(latitude) || isNaN(longitude) || isNaN(radius_km)) {
      return res.status(400).json({ msg: "Latitude, Longitude, and Radius must be numbers" });
    }

    const [result] = await pool.query(
      `UPDATE delivery_zones 
       SET name = ?, latitude = ?, longitude = ?, radius_km = ? 
       WHERE id = ?`,
      [name.trim(), latitude, longitude, radius_km, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: "Zone not found" });
    }

    res.json({ msg: "Zone updated", id, name, latitude, longitude, radius_km });
  } catch (err) {
    console.error("Error updating delivery zone:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────── Delete a zone ───────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(`DELETE FROM delivery_zones WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: "Zone not found" });
    }

    res.json({ msg: "Zone deleted" });
  } catch (err) {
    console.error("Error deleting delivery zone:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────── Check if location is inside zone ───────────────────
router.post("/check", async (req, res) => {
  try {
    let { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ msg: "Missing coordinates" });
    }

    latitude = parseFloat(latitude);
    longitude = parseFloat(longitude);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ msg: "Latitude and Longitude must be numbers" });
    }

    const [zones] = await pool.query("SELECT * FROM delivery_zones");
    if (!zones.length) {
      return res.json({ allowed: false, msg: "No delivery zones set" });
    }

    // Haversine
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius km

    let allowed = false;
    let matchedZone = null;

    for (let zone of zones) {
      const dLat = toRad(latitude - parseFloat(zone.latitude));
      const dLon = toRad(longitude - parseFloat(zone.longitude));

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(parseFloat(zone.latitude))) *
          Math.cos(toRad(latitude)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c; // km

      console.log(
        `User is ${distance.toFixed(2)} km from zone ${zone.name} (radius ${zone.radius_km} km)`
      );

      if (distance <= zone.radius_km) {
        allowed = true;
        matchedZone = zone;
        break;
      }
    }

    res.json({ allowed, zone: matchedZone });
  } catch (err) {
    console.error("Zone check error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
