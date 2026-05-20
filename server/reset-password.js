#!/usr/bin/env node
/**
 * 管理员密码重置脚本
 * 用法: node reset-password.js <用户名> [新密码]
 * 示例: 
 *   node reset-password.js admin        # 重置admin密码并生成随机密码
 *   node reset-password.js admin 123456 # 设置admin新密码为123456
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, '..', 'uploads', 'users.json');
const SECRET_KEY = 'calendar-server-secret-key-2024';

function hashPassword(password) {
    return crypto.createHash('sha256').update(password + SECRET_KEY).digest('hex');
}

function generateRandomPassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
}

function resetPassword() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('用法: node reset-password.js <用户名> [新密码]');
        console.log('');
        console.log('示例:');
        console.log('  node reset-password.js admin        # 重置admin密码（生成随机密码）');
        console.log('  node reset-password.js admin 123456 # 设置新密码为123456');
        process.exit(1);
    }
    
    const username = args[0];
    const newPassword = args[1] || generateRandomPassword();
    
    // 读取用户数据
    let data;
    try {
        data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (err) {
        console.error('❌ 无法读取用户文件:', USERS_FILE);
        process.exit(1);
    }
    
    // 查找用户
    const userIdx = data.users.findIndex(u => u.username === username);
    
    if (userIdx === -1) {
        console.error(`❌ 用户 "${username}" 不存在`);
        process.exit(1);
    }
    
    // 重置密码
    data.users[userIdx].password = hashPassword(newPassword);
    
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
        
        console.log('✅ 密码重置成功！');
        console.log('');
        console.log(`用户名: ${username}`);
        console.log(`新密码: ${newPassword}`);
        console.log('');
        console.log('⚠️  请立即使用新密码登录，并修改为更安全的密码');
        
    } catch (err) {
        console.error('❌ 保存失败:', err.message);
        process.exit(1);
    }
}

resetPassword();
