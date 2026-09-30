// @ts-nocheck
const net = require('net');
const os = require('os');
const url = require('url');

function transformIPv6toIPv4(ip) {
    // 这是一个简化版本的转换函数
    const match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return match ? match[1] : ip;
}

export = function (hostPort, listener) {
    let addr, port;

    let inputURL;
    if (!hostPort.startsWith('http://') && !hostPort.startsWith('https://') && !hostPort.startsWith('grpc://')) {
        inputURL = `http://${hostPort}`;
    } else {
        inputURL = hostPort;
    }
    const parsedURL = url.parse(inputURL);

    addr = parsedURL.hostname;
    port = parsedURL.port;
    // 监听器提供的端口优先使用
    if (listener && typeof listener.address === 'function') {
        const address = listener.address();
        if (address.family === 'IPv6') {
            addr = transformIPv6toIPv4(address.address);
        } else {
            addr = address.address;
        }
        port = address.port.toString();
    }

    // 如果地址有效并且不是代表“所有地址”的特殊IP，则直接使用
    if (addr.length > 0 && addr !== '0.0.0.0' && addr !== '[::]' && addr !== '::') {
        return net.isIPv4(addr) ? addr + ':' + port : '[' + addr + ']:' + port;
    }

    // 寻找第一个有效的非内部IPv4地址
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
        for (const ifaceDetails of iface) {
            // 直接处理IPv4地址
            if (ifaceDetails.family === 'IPv4' && !ifaceDetails.internal) {
                return ifaceDetails.address + ':' + port;
            }
            // 转换IPv6映射的IPv4地址
            if (ifaceDetails.family === 'IPv6') {
                const ipv4 = transformIPv6toIPv4(ifaceDetails.address);
                if (net.isIPv4(ipv4) && !ifaceDetails.internal) {
                    return ipv4 + ':' + port;
                }
            }
        }
    }

    throw new Error("No valid external IP address found");
}
