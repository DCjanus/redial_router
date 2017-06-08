import re
import time
import random
import requests
from Crypto.Hash import SHA

# 路由器IP
route_address = "192.168.31.1"
# 路由器管理密码
route_password = ""


def __create_nonce(device_id: str) -> str:
    """
    生成登录所需的nonce参数
    :param device_id: 设备ID，由网页端返回
    :return: 生成的nonce值
    """
    the_time = int(time.time())
    the_random = random.randint(0, 10000)
    the_type = 0
    return "_".join((the_type.__str__(), device_id, the_time.__str__(), the_random.__str__()))


def __encryption(old_password: str, key: str, nonce: str) -> str:
    """
    登录提交的表单中密码需要进行加密
    :param old_password: 原始密码
    :param key: 从网页端返回的key
    :param nonce: 本地生成的一个参数
    :return: 加密后的密码
    """
    pwd = SHA.new()
    pwd.update((old_password + key).encode())
    temp = pwd.hexdigest()

    pwd = SHA.new()
    pwd.update((nonce + temp).encode())
    return pwd.hexdigest()


def __get_key_and_device_id() -> (str, str):
    """
    获取网页首页数据，提取当前路由器对应的key和device_id
    :return: 提取到的key和device_id
    """
    text = requests.get(f"http://{route_address}/cgi-bin/luci/web").text
    return re.search("key: '([a-z0-9]+?)',", text).group(1), re.search(
        "var deviceId = '([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})';", text).group(1)


def __login():
    """
    模拟登陆
    :return: 登陆后获取的Token
    """
    key, device_id = __get_key_and_device_id()
    nonce = __create_nonce(device_id)
    password = __encryption(route_password, key, nonce)

    data = {
        "logtype": 2,
        "nonce": nonce,
        "password": password,
        "username": "admin"
    }

    return requests.post(f"http://{route_address}/cgi-bin/luci/api/xqsystem/login", data=data).json()["token"]


def __get_status(stok: str = None):
    """
    获取当前网络状况
    :param stok: 登录获取的Token
    :return: 当前网络连接情况的状态码，2表示正常连接，1表示没有外网连接
    """
    if stok is None:
        stok = __login()
    status_url = f"http://{route_address}/cgi-bin/luci/;stok={stok}/api/xqnetwork/pppoe_status"
    return requests.get(status_url).json()["status"]


def re_dial():
    """
    重新拨号
    """
    stok = __login()
    stop_url = f"http://{route_address}/cgi-bin/luci/;stok={stok}/api/xqnetwork/pppoe_stop"
    start_url = f"http://{route_address}/cgi-bin/luci/;stok={stok}/api/xqnetwork/pppoe_start"
    print("准备重连")
    requests.get(stop_url)
    print("完成断开")
    requests.get(start_url)
    while __get_status() != 2:
        time.sleep(1)
    print("完成重连")
