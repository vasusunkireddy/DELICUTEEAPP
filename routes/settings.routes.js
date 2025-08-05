const express = require('express');
const router  = express.Router();
const pool    = require('../db');

/* GET current settings (single row) */
router.get('/', async (_req,res)=>{
  const [rows] = await pool.query('SELECT * FROM settings WHERE id=1');
  res.json(rows[0] || {});
});

/* PATCH – partial update */
router.patch('/', async (req,res)=>{
  const allowed = [
    'app_name','logo_url','banner_url','support_email','support_phone',
    'cod_enabled','google_login','delivery_radius_km','tax_percent','delivery_fee'
  ];
  const fields = Object.keys(req.body).filter(k=>allowed.includes(k));
  if(!fields.length) return res.status(400).json({message:'No valid fields supplied'});

  const setClause = fields.map(k=>`${k}=?`).join(', ');
  const values    = fields.map(k=>req.body[k]);
  await pool.query(`UPDATE settings SET ${setClause} WHERE id=1`, values);
  res.json({message:'updated', updated: fields});
});

module.exports = router;
