"""Runs each pipeline job in its own thread on a fixed interval and records status in pub/status.json."""
import datetime, json, os, subprocess, sys, threading, time
from common import write_json, read_json, PUB

H = 3600
JOBS = [  # name, script, interval seconds, retry-after-failure seconds, needs output file
    ('kp', 'kp.py', H, 600, 'kp.json'),
    ('wx', 'wx.py', H, 600, 'wx.json'),
    ('ofm', 'ofm.py', 24 * H, 2 * H, None),
    ('amc', 'amc.py', 30 * 60, 600, 'zones.geojson'),
    ('basemap', 'basemap.py', 30 * 24 * H, 6 * H, 'hr.pmtiles'),
    ('osm', 'osm.py', 7 * 24 * H, 6 * H, 'places.json'),
]
lock = threading.Lock()
status = read_json('status.json', {}) or {}


def save():
    with lock:
        write_json('status.json', status)


def run(name, script, every, retry, out):
    here = os.path.dirname(os.path.abspath(__file__))
    if name == 'amc':
        time.sleep(60)  # give ofm a head start on first boot
    while True:
        st = status.get(name, {})
        last_ok = st.get('ok_ts', 0)
        have = out is None or os.path.exists(os.path.join(PUB, out))
        due = (time.time() - last_ok) >= every or not have
        if due:
            t0 = time.time()
            p = subprocess.run([sys.executable, os.path.join(here, script)], cwd=here, capture_output=True, text=True, timeout=4 * H)
            now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            if p.returncode == 0:
                st = {'ok': now, 'ok_ts': time.time(), 'secs': round(time.time() - t0), 'msg': p.stdout.strip()[-300:]}
            else:
                st = dict(st, err=now, err_msg=(p.stderr or p.stdout).strip()[-500:])
            status[name] = st
            save()
            print(name, 'ok' if p.returncode == 0 else 'FAIL', (p.stdout + p.stderr).strip()[-300:], flush=True)
            time.sleep(every if p.returncode == 0 else retry)
        else:
            time.sleep(min(600, max(30, every - (time.time() - last_ok))))


for j in JOBS:
    threading.Thread(target=run, args=j, daemon=True).start()
while True:
    time.sleep(3600)
