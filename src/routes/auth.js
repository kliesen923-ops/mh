const express = require('express');
const { dbPool } = require('../db');
const { hashPassword, verifyPassword } = require('../auth/password');
const { sanitizeAccountId, sanitizeAccountPassword, sanitizeName } = require('../utils/sanitize');

const router = express.Router();

router.post('/register', async (req, res) => {
    const id = sanitizeAccountId(req.body && req.body.id);
    const nickname = sanitizeName(req.body && req.body.nickname, '');
    const password = sanitizeAccountPassword(req.body && req.body.password);
    const confirmPassword = sanitizeAccountPassword(req.body && req.body.confirmPassword);

    if (!id || id.length < 2) return res.status(400).json({ ok: false, error: '아이디는 2자 이상이어야 합니다.' });
    if (!nickname || nickname.length < 2) return res.status(400).json({ ok: false, error: '닉네임은 2자 이상이어야 합니다.' });
    if (!password) return res.status(400).json({ ok: false, error: '비밀번호를 입력해 주세요.' });
    if (password !== confirmPassword) return res.status(400).json({ ok: false, error: '비밀번호가 일치하지 않습니다.' });
    if (!dbPool) return res.status(500).json({ ok: false, error: 'DATABASE_URL이 설정되지 않았습니다.' });

    const existing = await dbPool.query('SELECT 1 FROM accounts WHERE id = $1 OR nickname = $2 LIMIT 1', [id, nickname]);
    if (existing.rowCount > 0) {
        return res.status(409).json({ ok: false, error: '이미 사용 중인 아이디 또는 닉네임입니다.' });
    }

    await dbPool.query(
        'INSERT INTO accounts (id, nickname, password_hash, kills, deaths) VALUES ($1, $2, $3, 0, 0)',
        [id, nickname, hashPassword(password)]
    );
    return res.json({ ok: true, id, nickname });
});

router.post('/login', async (req, res) => {
    const id = sanitizeAccountId(req.body && req.body.id);
    const password = sanitizeAccountPassword(req.body && req.body.password);
    if (!id || !password) return res.status(400).json({ ok: false, error: '아이디와 비밀번호를 입력해 주세요.' });
    if (!dbPool) return res.status(500).json({ ok: false, error: 'DATABASE_URL이 설정되지 않았습니다.' });

    const result = await dbPool.query('SELECT id, nickname, password_hash FROM accounts WHERE id = $1', [id]);
    const account = result.rows[0];
    if (!account || !verifyPassword(password, account.password_hash)) {
        return res.status(401).json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    return res.json({ ok: true, id: account.id, nickname: account.nickname });
});

module.exports = router;
