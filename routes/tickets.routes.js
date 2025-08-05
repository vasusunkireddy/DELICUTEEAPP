const express = require('express');
const router  = express.Router();
const pool    = require('../db');

/* GET list grouped by status */
router.get('/', async (_req,res)=>{
  const [rows] = await pool.query('SELECT * FROM tickets ORDER BY createdAt DESC');
  res.json(rows);
});

/* CREATE ticket */
router.post('/', async (req,res)=>{
  const { orderId=null, customerId, title, message, category='COMPLAINT' } = req.body;
  if(!customerId||!title||!message)
    return res.status(400).json({message:'Missing required fields'});
  const [r] = await pool.query(
    'INSERT INTO tickets (orderId,customerId,title,message,category) VALUES (?,?,?,?,?)',
    [orderId, customerId, title, message, category]
  );
  res.status(201).json({id:r.insertId});
});

/* UPDATE status + optional note */
router.patch('/:id', async (req,res)=>{
  const { id } = req.params;
  const { newStatus, note='' } = req.body;
  if(!['IN_PROGRESS','RESOLVED','CLOSED'].includes(newStatus))
    return res.status(400).json({message:'Invalid status'});
  await pool.query('UPDATE tickets SET status=? WHERE id=?',[newStatus,id]);
  await pool.query(
    'INSERT INTO ticket_status (ticketId,status,note) VALUES (?,?,?)',
    [id,newStatus,note]
  );
  res.json({message:'status updated'});
});

/* DELETE ticket (rare) */
router.delete('/:id', async (req,res)=>{
  await pool.query('DELETE FROM tickets WHERE id=?',[req.params.id]);
  res.json({message:'deleted'});
});

module.exports = router;
