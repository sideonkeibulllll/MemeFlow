#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""release/ 目录局域网下载服务（给手机装 APK 用）

沿用 yiyan-personal-database/_fileserve.py 的做法，解决过这些坑：
- ThreadingHTTPServer：并发处理连接（单线程会被浏览器的空闲连接堵死）
- HTTP/1.1 + Accept-Ranges + Range 断点续传（安卓 DownloadManager 需要 206）
- APK 用 application/octet-stream（避免安卓走「安装包」特殊流程卡住）
- HEAD 支持 + 客户端中断不再刷 traceback
- 按 full / lite 分组，最新版本打标签

用法：python _fileserve.py [端口]   默认 8903
"""
import http.server
import os
import re
import socket
import sys
import urllib.parse

PORT = 8903
DOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'release')
VER_RE = re.compile(r'v(\d+)\.(\d+)\.(\d+)')
RANGE_RE = re.compile(r'bytes=(\d*)-(\d*)$')
APK_TYPES = ('.apk', '.zip', '.apks', '.xapk')


def ver_key(name):
    m = VER_RE.search(name)
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)


def kind_of(name):
    low = name.lower()
    if 'lite' in low:
        return 'lite'
    if 'full' in low or name.lower().endswith('.apk'):
        return 'full'
    return 'other'


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    # 常见网段兜底
    try:
        host = socket.gethostbyname(socket.gethostname())
        if host and not host.startswith('127.') and host not in ips:
            ips.append(host)
    except Exception:
        pass
    return ips


def content_disposition(name):
    ascii_name = name.encode('ascii', 'ignore').decode().replace('"', '') or 'download'
    return ("attachment; filename=\"%s\"; filename*=UTF-8''%s"
            % (ascii_name, urllib.parse.quote(name)))


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'memeflow-fileserve/1'
    _remaining = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DOC, **kwargs)

    # ---------- 路由 ----------
    def do_GET(self):
        self._dispatch(head=False)

    def do_HEAD(self):
        self._dispatch(head=True)

    def _dispatch(self, head):
        try:
            if self.path.split('?')[0] in ('/', '/index.html'):
                body = self.render_index().encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                if not head:
                    self.wfile.write(body)
                return
            if head:
                f = self.send_head()
                if f:
                    f.close()
                return
            return super().do_GET()
        except (ConnectionResetError, BrokenPipeError) as e:
            print('[%s] 客户端中断: %s' % (self.address_string(), e), flush=True)

    # ---------- 首页 ----------
    def render_index(self):
        try:
            names = [f for f in os.listdir(DOC)
                     if os.path.isfile(os.path.join(DOC, f)) and not f.startswith('.')]
        except OSError:
            names = []

        versions = sorted({ver_key(n) for n in names if ver_key(n) != (0, 0, 0)})
        latest = versions[-1] if versions else None

        def row(f):
            size = os.path.getsize(os.path.join(DOC, f)) / 1048576
            if latest and ver_key(f) == latest:
                tag = '<span class="hot">最新</span>'
            elif ver_key(f) != (0, 0, 0) and latest and ver_key(f) < latest:
                tag = '<span class="old">旧</span>'
            else:
                tag = ''
            return ('<li><a href="/%s">%s</a><small>%.0f MB</small>%s</li>'
                    % (urllib.parse.quote(f), f, size, tag))

        groups = {'full': [], 'lite': [], 'other': []}
        for f in names:
            groups[kind_of(f)].append(f)
        for k in groups:
            groups[k].sort(key=lambda n: (ver_key(n), n), reverse=True)

        def section(title, items, hint=''):
            if not items:
                return ''
            h = '<h2>%s</h2>' % title
            if hint:
                h += '<p class="hint">%s</p>' % hint
            return h + '<ul>' + ''.join(row(f) for f in items) + '</ul>'

        body = (
            section('Full · 含图完整包', groups['full'],
                    '装一次就有图。装新版前先在系统设置里卸载旧的，否则私有目录里不会重新释放图片') +
            section('Lite · 无图更新包', groups['lite'],
                    '只有程序本体（约 4 MB），依赖旧版 Full 释放过的图片。装完 Full 之后再装它') +
            section('其他', groups['other'])
        ) or '<p class="empty">release 目录是空的</p>'

        return '''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MemeFlow · APK 下载</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;
     background:#0c0c10;color:#e9e9f1;padding:18px 16px 40px;margin:0;line-height:1.6}
h1{font-size:18px;color:#8b7cf6;margin:0 0 2px;letter-spacing:.04em}
p.sub{color:#6d6d7e;font-size:12px;margin:0 0 6px}
h2{font-size:13px;color:#a8a8bb;margin:22px 0 2px;letter-spacing:.08em}
p.hint{color:#5c5c70;font-size:11px;margin:0 0 6px}
ul{list-style:none;padding:0;margin:0}
li{background:#14141a;border:1px solid #22222b;border-radius:10px;
   padding:12px 13px;margin:7px 0;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
li a{color:#b3a8ff;text-decoration:none;font-size:14px;word-break:break-all;flex:1 1 auto}
li a:active{color:#fff}
small{color:#6d6d7e;font-size:12px;white-space:nowrap}
.hot{background:#8b7cf6;color:#fff;padding:1px 7px;border-radius:4px;font-size:11px;white-space:nowrap}
.old{background:#26262f;color:#6d6d7e;padding:1px 7px;border-radius:4px;font-size:11px;white-space:nowrap}
.empty{color:#4e4e60;font-size:13px}
</style></head><body>
<h1>MemeFlow · APK 下载</h1>
<p class="sub">%d 个文件 · 同一 WiFi 下可直接点开安装</p>
%s
</body></html>''' % (len(names), body)

    # ---------- 文件响应（含 Range） ----------
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()

        name = os.path.basename(path)
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, 'File not found')
            return None

        size = os.fstat(f.fileno()).st_size
        ext = os.path.splitext(name)[1].lower()
        ctype = ('application/octet-stream' if ext in APK_TYPES
                 else (self.guess_type(path) or 'application/octet-stream'))

        start, end, status = 0, size - 1, 200
        rng = self.headers.get('Range')
        if rng:
            m = RANGE_RE.match(rng.split(',')[0].strip())
            if m:
                s, e = m.group(1), m.group(2)
                if s:
                    start = int(s)
                    end = int(e) if e else size - 1
                elif e:
                    start = max(0, size - int(e))
                if start >= size:
                    self.send_response(416)
                    self.send_header('Content-Range', 'bytes */%d' % size)
                    self.send_header('Content-Length', '0')
                    self.end_headers()
                    f.close()
                    return None
                end = min(end, size - 1)
                status = 206
                f.seek(start)

        length = end - start + 1
        print('[%s] %s %s%s -> %d (%d MB)%s'
              % (self.address_string(), self.command, name,
                 ' [Range %s]' % rng if rng else '', status,
                 length / 1048576,
                 ' UA=' + self.headers.get('User-Agent', '')[:60]),
              flush=True)

        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Disposition', content_disposition(name))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        if status == 206:
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.end_headers()

        self._remaining = length
        return f

    def copyfile(self, source, outputfile):
        """按 Content-Length 精确发送（Range 时只发区间）"""
        remaining = self._remaining
        self._remaining = None
        if remaining is None:
            return super().copyfile(source, outputfile)
        buf = 256 * 1024
        while remaining > 0:
            chunk = source.read(min(buf, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def end_headers(self):
        if self.path.split('?')[0] not in ('/', '/index.html'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def log_error(self, fmt, *args):
        print('[%s] ERROR %s' % (self.address_string(), fmt % args), flush=True)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    if len(sys.argv) > 1:
        PORT = int(sys.argv[1])
    if not os.path.isdir(DOC):
        raise SystemExit('目录不存在: %s' % DOC)
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        print('Serving %s' % DOC, flush=True)
        print('  本机:   http://127.0.0.1:%d/' % PORT, flush=True)
        for ip in lan_ips():
            print('  局域网: http://%s:%d/' % (ip, PORT), flush=True)
        print('Ctrl+C 停止', flush=True)
        httpd.serve_forever()
