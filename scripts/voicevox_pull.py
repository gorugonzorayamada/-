"""VOICEVOX エンジン（CPU 版）を Docker Hub の公式イメージ voicevox/voicevox_engine から取り出す。
Docker がなくても動く（レジストリから直接レイヤーを取得して展開する）。
使い方: python3 scripts/voicevox_pull.py <展開先ディレクトリ>
"""
import json, os, sys, tarfile, urllib.request
repo, tag = 'voicevox/voicevox_engine', 'cpu-amd64-latest'
def get(url, headers={}):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=600)
tok = json.load(get(f'https://auth.docker.io/token?service=registry.docker.io&scope=repository:{repo}:pull'))['token']
H = {'Authorization': f'Bearer {tok}', 'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json'}
m = json.load(get(f'https://registry-1.docker.io/v2/{repo}/manifests/{tag}', H))
if 'manifests' in m:
    d = [x for x in m['manifests'] if x.get('platform', {}).get('architecture') == 'amd64'][0]['digest']
    m = json.load(get(f'https://registry-1.docker.io/v2/{repo}/manifests/{d}', H))
dest = sys.argv[1] if len(sys.argv) > 1 else 'rootfs'
os.makedirs(dest, exist_ok=True)
for i, l in enumerate(m['layers']):
    print(f"layer {i+1}/{len(m['layers'])} {l['size']/1e6:.0f}MB", flush=True)
    with get(f"https://registry-1.docker.io/v2/{repo}/blobs/{l['digest']}", H) as r:
        with tarfile.open(fileobj=r, mode='r|*') as tf:
            for mem in tf:
                if mem.isdev() or '..' in mem.name: continue
                try: tf.extract(mem, dest, set_attrs=False)
                except Exception as e: pass
print('done')
