const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(UPLOAD_DIR, 'resources.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_KEY = 'calendar-server-secret-key-2024';

// 确保数据目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 确保 JSON 文件存在
if (!fs.existsSync(JSON_FILE)) {
    fs.writeFileSync(JSON_FILE, JSON.stringify({ resources: [] }, null, 2));
}
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [], tokens: {} }, null, 2));
}

// 用户管理
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        }
    } catch (err) {
        console.error('加载用户失败:', err);
    }
    return { users: [], tokens: {} };
}

function saveUsers(data) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error('保存用户失败:', err);
        return false;
    }
}

// 初始化默认用户（仅当没有用户时）
function initDefaultUser() {
    const data = loadUsers();
    if (data.users.length === 0) {
        // 首次启动时不创建默认用户，等待第一个用户注册
        console.log('System ready. First user to set password will become admin.');
    } else {
        // 如果已有用户，确保第一个用户是admin角色
        if (data.users[0].role !== 'admin') {
            data.users[0].role = 'admin';
            saveUsers(data);
            console.log('First user promoted to admin');
        }
    }
}
initDefaultUser();

// 密码哈希
function hashPassword(password) {
    return crypto.createHash('sha256').update(password + SECRET_KEY).digest('hex');
}

// 生成token
function generateToken(username) {
    const payload = `${username}:${Date.now()}`;
    return crypto.createHash('sha256').update(payload + SECRET_KEY).digest('hex');
}

// 验证token，返回用户信息
function verifyToken(token) {
    const data = loadUsers();
    const username = data.tokens?.[token];
    if (!username) return null;
    const user = data.users.find(u => u.username === username);
    return user ? { username: user.username, role: user.role } : null;
}

// 中间件 - 验证登录
function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const user = verifyToken(token);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    req.user = user.username;
    req.userRole = user.role;
    next();
}

// 中间件 - 验证管理员权限
function adminMiddleware(req, res, next) {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    next();
}

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 - 用于管理页面
app.use('/static', express.static(path.join(__dirname, 'public')));

// ============ 认证API ============

// POST /api/auth/login - 登录
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: '请输入用户名和密码' });
    }
    
    const data = loadUsers();
    const user = data.users.find(u => u.username === username);
    
    if (!user) {
        return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    
    // 检查是否设置了密码（白名单用户没有密码）
    if (!user.password) {
        return res.status(401).json({ success: false, error: '该用户尚未设置密码，请联系管理员' });
    }
    
    // 验证密码
    if (user.password !== hashPassword(password)) {
        return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    
    const token = generateToken(username);
    
    // 保存token
    if (!data.tokens) data.tokens = {};
    data.tokens[token] = username;
    saveUsers(data);
    
    res.json({ success: true, token, username, role: user.role });
});

// POST /api/auth/check-user - 检查用户状态（存在/不存在/待设置密码）
app.post('/api/auth/check-user', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ success: false, error: '请输入用户名' });
    }
    
    const data = loadUsers();
    const hasUsers = data.users.length > 0;
    const user = data.users.find(u => u.username === username);
    
    if (!user) {
        // 用户不存在 - 如果系统没有用户，则可以注册
        return res.json({ success: true, exists: false, canRegister: !hasUsers });
    }
    
    // 用户存在，检查是否设置过密码
    const hasPassword = !!user.password;
    res.json({ success: true, exists: true, hasPassword });
});

// POST /api/auth/set-password - 设置密码（首个用户注册或白名单用户设置密码）
app.post('/api/auth/set-password', (req, res) => {
    const { username, password, confirmPassword } = req.body;
    
    if (!username || !password || !confirmPassword) {
        return res.status(400).json({ success: false, error: '请填写所有字段' });
    }
    
    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, error: '两次密码不一致' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ success: false, error: '密码至少6位' });
    }
    
    const data = loadUsers();
    let userIdx = data.users.findIndex(u => u.username === username);
    
    if (userIdx === -1) {
        // 用户不存在 - 如果系统没有用户，则创建第一个用户（管理员）
        if (data.users.length === 0) {
            data.users.push({
                username,
                password: hashPassword(password),
                created_at: new Date().toISOString(),
                role: 'admin'  // 第一个用户自动成为管理员
            });
            userIdx = 0;
        } else {
            return res.status(404).json({ success: false, error: '用户不存在，请联系管理员添加' });
        }
    } else {
        // 用户存在 - 检查是否已设置密码
        if (data.users[userIdx].password) {
            return res.status(400).json({ success: false, error: '该用户已设置过密码' });
        }
        data.users[userIdx].password = hashPassword(password);
    }
    
    if (saveUsers(data)) {
        const token = generateToken(username);
        if (!data.tokens) data.tokens = {};
        data.tokens[token] = username;
        saveUsers(data);
        res.json({ success: true, token, username, role: data.users[userIdx].role });
    } else {
        res.status(500).json({ success: false, error: '设置密码失败' });
    }
});

// POST /api/auth/logout - 登出
app.post('/api/auth/logout', authMiddleware, (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const data = loadUsers();
    if (data.tokens && data.tokens[token]) {
        delete data.tokens[token];
        saveUsers(data);
    }
    res.json({ success: true });
});

// POST /api/auth/register - 注册用户（仅管理员，白名单模式）
app.post('/api/auth/register', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ success: false, error: '请输入用户名' });
    }
    
    if (username.length < 3) {
        return res.status(400).json({ success: false, error: '用户名至少3位' });
    }
    
    const data = loadUsers();
    
    if (data.users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, error: '用户名已存在' });
    }
    
    data.users.push({
        username,
        created_at: new Date().toISOString(),
        role: 'user'
    });
    
    if (saveUsers(data)) {
        res.json({ success: true, message: '用户已添加到白名单' });
    } else {
        res.status(500).json({ success: false, error: '添加失败' });
    }
});

// GET /api/auth/verify - 验证token
app.get('/api/auth/verify', authMiddleware, (req, res) => {
    res.json({ success: true, username: req.user, role: req.userRole });
});

// ============ 用户管理API (仅管理员) ============

// GET /api/users - 获取所有用户
app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
    const data = loadUsers();
    const users = data.users.map(u => ({
        username: u.username,
        role: u.role,
        created_at: u.created_at,
        password: u.password || null
    }));
    res.json({ success: true, data: users });
});

// DELETE /api/users/:username - 删除用户
app.delete('/api/users/:username', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.params;
    
    // 不允许删除自己
    if (username === req.user) {
        return res.status(400).json({ success: false, error: '不能删除当前登录用户' });
    }
    
    const data = loadUsers();
    const userIdx = data.users.findIndex(u => u.username === username);
    
    if (userIdx === -1) {
        return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    // 不允许删除管理员
    if (data.users[userIdx].role === 'admin') {
        return res.status(400).json({ success: false, error: '不能删除管理员用户' });
    }
    
    data.users.splice(userIdx, 1);
    
    if (saveUsers(data)) {
        res.json({ success: true, message: '用户删除成功' });
    } else {
        res.status(500).json({ success: false, error: '删除失败' });
    }
});

// DELETE /api/users/:username/password - 删除用户密码
app.delete('/api/users/:username/password', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.params;
    
    const data = loadUsers();
    const userIdx = data.users.findIndex(u => u.username === username);
    
    if (userIdx === -1) {
        return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    // 不能删除管理员密码
    if (data.users[userIdx].role === 'admin') {
        return res.status(400).json({ success: false, error: '不能删除管理员密码' });
    }
    
    // 不能删除自己密码
    if (username === req.user) {
        return res.status(400).json({ success: false, error: '不能删除自己的密码' });
    }
    
    // 删除密码
    delete data.users[userIdx].password;
    
    if (saveUsers(data)) {
        res.json({ success: true, message: '用户密码已删除' });
    } else {
        res.status(500).json({ success: false, error: '删除失败' });
    }
});

// PUT /api/users/:username/role - 修改用户角色
app.put('/api/users/:username/role', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.params;
    const { role } = req.body;
    
    if (!role || !['admin', 'user'].includes(role)) {
        return res.status(400).json({ success: false, error: '无效的角色' });
    }
    
    const data = loadUsers();
    const userIdx = data.users.findIndex(u => u.username === username);
    
    if (userIdx === -1) {
        return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    // 不能修改自己的角色
    if (username === req.user) {
        return res.status(400).json({ success: false, error: '不能修改自己的角色' });
    }
    
    // 不能将最后一个管理员降级
    if (role === 'user') {
        const adminCount = data.users.filter(u => u.role === 'admin').length;
        if (adminCount <= 1 && data.users[userIdx].role === 'admin') {
            return res.status(400).json({ success: false, error: '不能删除最后一个管理员' });
        }
    }
    
    data.users[userIdx].role = role;
    
    if (saveUsers(data)) {
        res.json({ success: true, message: `已将 ${username} 设置为 ${role === 'admin' ? '管理员' : '普通用户'}` });
    } else {
        res.status(500).json({ success: false, error: '修改失败' });
    }
});

// ============ 资源API (需要认证) ============

// 加载资源列表
function loadResources() {
    try {
        if (fs.existsSync(JSON_FILE)) {
            const data = fs.readFileSync(JSON_FILE, 'utf-8');
            return JSON.parse(data).resources || [];
        }
    } catch (err) {
        console.error('加载资源失败:', err);
    }
    return [];
}

// 保存资源列表
function saveResources(resources) {
    try {
        fs.writeFileSync(JSON_FILE, JSON.stringify({ resources }, null, 2));
        return true;
    } catch (err) {
        console.error('保存资源失败:', err);
        return false;
    }
}

// multer 配置
const storage = multer.memoryStorage();
const upload = multer({ storage });

// GET /api/resources - 获取所有资源
app.get('/api/resources', authMiddleware, (req, res) => {
    const resources = loadResources();
    res.json({
        success: true,
        data: resources
    });
});

// GET /api/resources/:uuid - 获取单个资源
app.get('/api/resources/:uuid', authMiddleware, (req, res) => {
    const resources = loadResources();
    const resource = resources.find(r => r.uuid === req.params.uuid);
    
    if (resource) {
        res.json({
            success: true,
            data: resource
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Resource not found'
        });
    }
});

// POST /api/resources - 上传文件
app.post('/api/resources', authMiddleware, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'name', maxCount: 1 }]), (req, res) => {
    try {
        const files = req.files;
        const customName = req.body.name;
        
        if (!files || !files.file || files.file.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }
        
        const file = files.file[0];
        const originalName = file.originalname;
        const displayName = customName || originalName;
        
        let resources = loadResources();
        
        // 检查是否存在同名资源
        const existingIdx = resources.findIndex(r => r.name === displayName);
        let finalUuid;
        
        if (existingIdx !== -1) {
            // 替换已有资源
            finalUuid = resources[existingIdx].uuid;
            resources.splice(existingIdx, 1);
        } else {
            finalUuid = uuidv4();
        }
        
        // 获取文件扩展名
        const ext = path.extname(originalName) || '.bin';
        const filename = `${finalUuid}${ext}`;
        const filepath = path.join(UPLOAD_DIR, filename);
        
        // 保存文件
        fs.writeFileSync(filepath, file.buffer);
        
        // 创建资源对象
        const resource = {
            id: finalUuid,
            name: displayName,
            uuid: finalUuid,
            path: `/api/files/${filename}`,
            size: file.size,
            content_type: file.mimetype,
            updated_at: new Date().toISOString()
        };
        
        resources.push(resource);
        
        if (saveResources(resources)) {
            res.json({
                success: true,
                data: resource
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to save resource'
            });
        }
    } catch (err) {
        console.error('上传失败:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// PUT /api/resources/:uuid - 更新资源
app.put('/api/resources/:uuid', authMiddleware, (req, res) => {
    const { uuid } = req.params;
    const { name } = req.body;
    let resources = loadResources();
    
    const idx = resources.findIndex(r => r.uuid === uuid);
    
    if (idx === -1) {
        return res.status(404).json({
            success: false,
            error: 'Resource not found'
        });
    }
    
    if (name) {
        resources[idx].name = name;
    }
    resources[idx].updated_at = new Date().toISOString();
    
    if (saveResources(resources)) {
        res.json({
            success: true,
            data: resources[idx]
        });
    } else {
        res.status(500).json({
            success: false,
            error: 'Failed to save'
        });
    }
});

// DELETE /api/resources/:uuid - 删除资源
app.delete('/api/resources/:uuid', authMiddleware, (req, res) => {
    const { uuid } = req.params;
    let resources = loadResources();
    
    const idx = resources.findIndex(r => r.uuid === uuid);
    
    if (idx === -1) {
        return res.status(404).json({
            success: false,
            error: 'Resource not found'
        });
    }
    
    const resource = resources.splice(idx, 1)[0];
    
    // 删除文件
    const filename = path.basename(resource.path);
    const filepath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }
    
    if (saveResources(resources)) {
        res.json({
            success: true,
            message: 'Resource deleted',
            data: resource
        });
    } else {
        res.status(500).json({
            success: false,
            error: 'Failed to save'
        });
    }
});

// GET /api/files - 下载文件（?name= 或 ?filename=）
app.get('/api/files', (req, res) => {
    const { name, filename } = req.query;
    const resources = loadResources();
    
    if (filename) {
        // 通过文件名下载
        const filepath = path.join(UPLOAD_DIR, filename);
        if (fs.existsSync(filepath)) {
            res.download(filepath, filename);
        } else {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    } else if (name) {
        // 通过资源名称下载
        const decodedName = decodeURIComponent(name);
        const resource = resources.find(r => r.name === decodedName);
        
        if (!resource) {
            return res.status(404).json({ success: false, error: 'Resource not found' });
        }
        
        const filepath = path.join(UPLOAD_DIR, path.basename(resource.path));
        
        if (fs.existsSync(filepath)) {
            res.setHeader('Content-Type', resource.content_type || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resource.name)}"`);
            res.sendFile(filepath);
        } else {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    } else {
        res.status(400).json({ success: false, error: 'Missing name or filename parameter' });
    }
});

// 管理页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 根路径 - 重定向到管理页面
app.get('/', (req, res) => {
    res.redirect('/admin');
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    console.log(`Upload directory: ${UPLOAD_DIR}`);
    console.log('API endpoints:');
    console.log('  GET    /api/resources         - List all resources');
    console.log('  GET    /api/resources/:uuid  - Get resource by UUID');
    console.log('  POST   /api/resources        - Upload new resource');
    console.log('  PUT    /api/resources/:uuid  - Update resource');
    console.log('  DELETE /api/resources/:uuid - Delete resource');
    console.log('  GET    /api/files?name=       - Download file by name');
    console.log('  GET    /api/files?filename=   - Download file by filename');
});
