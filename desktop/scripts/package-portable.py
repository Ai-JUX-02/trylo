from pathlib import Path
import argparse,concurrent.futures,collections,hashlib,json,os,time,zipfile

def main():
 parser=argparse.ArgumentParser(description='Package the already-built Windows Desktop as a portable ZIP (Python 3.10+).')
 parser.add_argument('--output',type=Path)
 parser.add_argument('--workers',type=int,default=16)
 args=parser.parse_args()
 root=Path(__file__).resolve().parents[2]
 version=json.loads((root/'desktop/package.json').read_text(encoding='utf-8'))['version']
 resources=root/'desktop/src-tauri/resources'
 output=args.output or root/f'result/desktop/Trylo-Desktop-{version}-windows-x64-portable.zip'
 output=output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
 if output.exists():raise SystemExit('Refusing to overwrite an existing portable archive: '+str(output))
 items=[]
 for tree in ['desktop-services','sidecars','work','workd','cli','cli-legacy','runtime']:
  source=resources/tree
  if not source.is_dir():raise SystemExit('Missing staged runtime: '+tree)
  for file in source.rglob('*'):
   if file.is_file():
    if file.is_symlink() or not file.resolve().is_relative_to(resources.resolve()):raise SystemExit('Redirected runtime file: '+str(file))
    items.append((file,file.relative_to(resources).as_posix()))
 executable=root/'desktop/src-tauri/target/release/trylo-desktop.exe'
 if not executable.is_file():raise SystemExit('Build the native Desktop application first')
 items.append((executable,'trylo-desktop.exe'))
 for name in ['NODE-v24.14.1-LICENSE.txt','WORKD-LICENSE.txt','TRYLO-LICENSE.txt','README-Desktop.txt']:
  file=root/'result/desktop'/name
  if file.exists():items.append((file,name))
 items.sort(key=lambda item:item[1]);started=time.monotonic()
 def read(item):
  file,name=item
  # Large binaries stream through ZipFile.write instead of filling the read queue.
  return file,name,None if file.stat().st_size>32*1024*1024 else file.read_bytes()
 partial=output.with_suffix(output.suffix+'.partial')
 if partial.exists():raise SystemExit('Review the previous partial archive first: '+str(partial))
 with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as archive,concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.workers,32))) as pool:
  pending=collections.deque()
  def store(future):
   file,name,data=future.result()
   if data is None:archive.write(file,name)
   else:archive.writestr(name,data)
  for item in items:
   pending.append(pool.submit(read,item))
   if len(pending)>=32:store(pending.popleft())
  while pending:store(pending.popleft())
 os.replace(partial,output)
 digest=hashlib.sha256()
 with output.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
 result={'file':output.name,'bytes':output.stat().st_size,'files':len(items),'sha256':digest.hexdigest(),'seconds':round(time.monotonic()-started,2)}
 output.with_suffix('.build.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(result,indent=2))

if __name__=='__main__':main()
