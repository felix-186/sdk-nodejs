// @ts-nocheck
const crypto = require('crypto');
const sm4 = require('sm-crypto').sm4;
;
const {Base64} = require('js-base64');

// 加密算法类型
const CipherType = {
  AES: 'AES',
  SM4: 'SM4'
};

// 加密模式类型
const Mode = {
  CBC: 'CBC'
};

const pkcs7UnPadding = (data) => {
  const padding = data[data.length - 1];
  if (padding > 0 && padding <= 16) { // SM4块大小为16
    for (let i = data.length - padding; i < data.length; i++) {
      if (data[i] !== padding) throw new Error('invalid padding byte');
    }
    return data.slice(0, data.length - padding);
  }
  return data;
};

function sm4CbcDecrypt(encrypted, key) {
  try {
    // 假设 encrypted 是 base64 编码的字符串
    const data = Buffer.from(encrypted, 'base64');
    const keyBuffer = Buffer.from(key, 'utf8');

    // SM4 块大小
    const blockSize = 16;

    // 检查数据长度
    if (data.length < blockSize) {
      throw new Error('ciphertext too short');
    }

    // 提取 IV（前16字节）
    const iv = data.slice(0, blockSize);

    // 提取密文（剩余部分）
    const ciphertext = data.slice(blockSize);

    // 检查密文长度
    if (ciphertext.length % blockSize !== 0) {
      throw new Error('ciphertext is not a multiple of the block size');
    }
    // 将结果转换为 Buffer 并去除 PKCS7 填充
    // 解密过程
    const decrypted = sm4.decrypt(ciphertext,keyBuffer, {
      mode: 'cbc',
      iv: iv,
      padding: 'pkcs7'
    });

    // 返回解密后的明文
    return decrypted;
  } catch (err) {
    console.error('SM4 CBC decryption failed:', err);
    throw new Error(`SM4 decryption failed: ${err.message}`);
  }
}

// AES CBC 解密函数
function aesCbcDecrypt(encrypted, key) {
  try {
    // 解码 base64
    const data = Base64.toUint8Array(encrypted);
    const keyBuffer = Buffer.from(key);

    // AES 块大小（CBC 模式固定为 16 字节）
    const blockSize = 16;

    // 检查数据长度
    if (data.length < blockSize) {
      throw new Error('ciphertext too short');
    }

    // 提取 IV（前16字节）
    const iv = data.slice(0, blockSize);

    // 提取密文（剩余部分）
    const ciphertext = data.slice(blockSize);

    // 检查密文长度
    if (ciphertext.length % blockSize !== 0) {
      throw new Error('ciphertext is not a multiple of the block size');
    }

    // 自动选择 AES 模式
    let algorithm;
    if (keyBuffer.length === 16) {
      algorithm = 'aes-128-cbc';
    } else if (keyBuffer.length === 32) {
      algorithm = 'aes-256-cbc';
    } else {
      throw new Error(`Unsupported key length: ${keyBuffer.length}`);
    }

    // 创建解密器
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);

    // 解密数据
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // 去除 PKCS7 填充
    return pkcs7UnPadding(decrypted).toString();
  } catch (err) {
    console.error('AES CBC decryption failed:', err);
    throw new Error('AES decryption failed');
  }
}

// 解密函数
function decrypt(encrypted, key, cipherType, mode) {
  if (mode !== Mode.CBC) {
    throw new Error('Only CBC mode is supported');
  }

  switch (cipherType) {
    case CipherType.AES:
      return aesCbcDecrypt(encrypted, key);
    case CipherType.SM4:
      return sm4CbcDecrypt(encrypted, key);
    default:
      throw new Error('unsupported cipher type');
  }
}

// 配置值解密函数
function decodeConfigValue(value, key) {
  if (typeof value !== 'string') {
    return value;
  }

  // 处理 AES_CBC(...) 格式
  if (value.startsWith('AES_CBC(') && value.endsWith(')')) {
    const encryptedStr = value.substring(8, value.length - 1);
    try {
      const decrypted = decrypt(encryptedStr, key, CipherType.AES, Mode.CBC);
      return decrypted.toString();
    } catch (err) {
      throw new Error(`AES解密错误: ${err.message} (输入: ${value})`);
    }
  }

  // 处理 SM4_CBC(...) 格式
  if (value.startsWith('SM4_CBC(') && value.endsWith(')')) {
    const encryptedStr = value.substring(8, value.length - 1);
    try {
      const decrypted = decrypt(encryptedStr, key, CipherType.SM4, Mode.CBC);
      return decrypted.toString();
    } catch (err) {
      throw new Error(`SM4解密错误: ${err.message} (输入: ${value})`);
    }
  }

  // 兼容旧格式 AES(...)
  if (value.startsWith('AES(') && value.endsWith(')')) {
    const encryptedStr = value.substring(4, value.length - 1);
    try {
      const decrypted = decrypt(encryptedStr, key, CipherType.AES, Mode.CBC);
      return decrypted.toString();
    } catch (err) {
      throw new Error(`AES解密错误: ${err.message} (输入: ${value})`);
    }
  }

  // 兼容旧格式 ENC(...) - Base64 解码
  if (value.startsWith('ENC(') && value.endsWith(')')) {
    const vStr = value.substring(4, value.length - 1);
    return Buffer.from(vStr, 'base64').toString();
  }

  return value;
}

// 递归解密配置对象
function decodeConfigRecursive(config, ckey) {
  if (!config) return config;

  // 处理数组
  if (Array.isArray(config)) {
    return config.map(item => decodeConfigRecursive(item, ckey));
  }

  // 处理对象
  if (typeof config === 'object' && config !== null) {
    const result = {};
    for (const key in config) {
      if (config.hasOwnProperty(key)) {
        result[key] = decodeConfigRecursive(config[key], ckey);
      }
    }
    return result;
  }

  // 处理字符串
  if (typeof config === 'string') {
    return decodeConfigValue(config, ckey);
  }

  // 其他类型直接返回
  return config;
}

// 主解密函数
function decodeConfig(config) {
  // 从环境变量获取密钥
  const key = process.env.KESI_CIPHER_KEY || (process.env.CONFIG_CIPHER_KEY === '__none__' ? undefined : process.env.CONFIG_CIPHER_KEY);

  // if (!key) {
  //   throw new Error('环境变量 KESI_CIPHER_KEY 未设置');
  // }

  // 递归处理配置对象
  return decodeConfigRecursive(config, key);
}

// 导出模块
export = {
  CipherType,
  Mode,
  decrypt,
  decodeConfigValue,
  decodeConfig
};
