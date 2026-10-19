"""Builds a self-contained Dockerfile (repo embedded as base64 tar.gz) for Coolify's 'Dockerfile' resource,
used while the GitHub repository is not connected."""
import base64, io, os, subprocess, tarfile
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = [f for f in subprocess.check_output(['git', 'ls-files'], cwd=root, text=True).split()
         if not f.startswith('artifact/') and f not in ('tools/maplibre-gl.css',)]
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz', compresslevel=9) as t:
    for f in files:
        t.add(os.path.join(root, f), arcname=f)
b64 = base64.b64encode(buf.getvalue()).decode()
chunks = [b64[i:i + 60000] for i in range(0, len(b64), 60000)]
df = open(os.path.join(root, 'Dockerfile')).read()
src = 'WORKDIR /app\n' + ''.join(f"RUN echo '{c}' >> /tmp/src.b64\n" for c in chunks) + 'RUN base64 -d /tmp/src.b64 | tar xz -C /app && rm /tmp/src.b64\n'
df = df.replace('WORKDIR /app\nCOPY . .\n', src).replace('COPY docker/nginx.conf /etc/nginx/nginx.conf\n', 'RUN cp /app/docker/nginx.conf /etc/nginx/nginx.conf\n')
assert 'COPY' not in df
out = os.path.join(root, 'build', 'Dockerfile.inline'); os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w').write(df)
print(out, len(df), len(chunks), 'chunks', len(files), 'files')
