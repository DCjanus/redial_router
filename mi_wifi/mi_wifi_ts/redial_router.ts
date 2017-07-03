import * as crypto from "crypto";
import * as request from "request-promise-native";

const route_address = "192.168.31.1";// 路由器IP
const route_password = "xxxxxxxxxx"; // 路由器管理密码（不是WiFi密码）
/**
 * 冒充其他语言里休眠当前线程一段时间的函数
 * @param timeout 休眠时间，以毫秒为单位
 */
async function sleep(timeout: number) {
    return new Promise(r => {
        setTimeout(function () {
            r();
        }, timeout);
    });
}
/**
 * 生成登录所需的nonce参数
 * @param device_id 设备ID，由网页端返回
 * @return 生成的nonce值
 */
function create_nonce(device_id: string) {
    const type = 0;
    const time = Math.floor(new Date().getTime() / 1000);
    const random = Math.floor(Math.random() * 10000);
    return [type, device_id, time, random].join('_');
}
/**
 * 登录提交的表单中密码需要进行加密
 * @param old_password 原始密码
 * @param key 从网页端返回的key
 * @param nonce 本地生成的一个参数
 * @return 加密后的密码
 */
function encryption(old_password: string, key: string, nonce: string) {
    let sha1 = crypto.createHash("sha1");
    sha1.update((old_password + key));
    const temp = sha1.digest("hex");

    sha1 = crypto.createHash("sha1");
    sha1.update((nonce + temp))
    return sha1.digest("hex");
}
/**
 * 获取网页首页数据，提取当前路由器对应的key和device_id
 * @return 提取到的key和device_id
 */
async function get_key_and_device_id() {
    const text: string = await request.get(`http://${route_address}/cgi-bin/luci/web`);
    const key_matcher = /key: '([a-z0-9]+?)',/.exec(text) || ["", ""];
    const key = key_matcher[1];

    const device_id_matcher = /var deviceId = '([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})';/.exec(text) || ["", ""];
    const device_id = device_id_matcher[1];

    return { key: key, device_id: device_id };
}
/**
 * 模拟登录
 * @return 登录后获取的Token
 */
async function get_stok() {
    const { key, device_id } = await get_key_and_device_id();
    const nonce = create_nonce(device_id);
    const password = encryption(route_password, key, nonce);

    const data = {
        "logtype": 2,
        "nonce": nonce,
        "password": password,
        "username": "admin"
    }

    return (await request.post(`http://${route_address}/cgi-bin/luci/api/xqsystem/login`, {
        formData: data,
        json: true
    }))["token"];

}
/**
 * 获取当前网络状况
 * @param stok 登录获取的token
 * @return 当前网络连接情况的状态码，2表示正常连接，1表示没有外网连接
 */
async function get_status(stok: string) {
    return (await request.get(`http://${route_address}/cgi-bin/luci/;stok=${stok}/api/xqnetwork/pppoe_status`, { json: true }))["status"];
}
/**
 * 重新拨号
 */
export async function redial() {
    const stok = await get_stok();
    console.log("准备重连");
    await request.get(`http://${route_address}/cgi-bin/luci/;stok=${stok}/api/xqnetwork/pppoe_stop`);
    await request.get(`http://${route_address}/cgi-bin/luci/;stok=${stok}/api/xqnetwork/pppoe_start`);
    while ((await get_status(stok)) != 2) {
        await sleep(200);
    }
    console.log("完成重连");
}