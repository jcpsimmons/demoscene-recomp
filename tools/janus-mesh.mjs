import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
const [,, src, out, targetTris] = process.argv;
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pa = prim.getAttribute('POSITION'); const ia = prim.getIndices();
// apply node world transform
const node = doc.getRoot().listNodes().find(n => n.getMesh());
const m = node.getWorldMatrix();
const n = pa.getCount(); const pos = new Float32Array(n * 3); const v = [0,0,0];
for (let i = 0; i < n; i++) { pa.getElement(i, v); // getElement returns normalized for quantized? handle
  const x=v[0],y=v[1],z=v[2];
  pos[i*3]=m[0]*x+m[4]*y+m[8]*z+m[12]; pos[i*3+1]=m[1]*x+m[5]*y+m[9]*z+m[13]; pos[i*3+2]=m[2]*x+m[6]*y+m[10]*z+m[14]; }
const raw = new Uint32Array(ia.getArray());
// weld by quantized position (normal seams split vertices)
const key=new Map(); const wmap=new Uint32Array(n);
for(let i=0;i<n;i++){const k=Math.round(pos[i*3]*1e3)+','+Math.round(pos[i*3+1]*1e3)+','+Math.round(pos[i*3+2]*1e3); if(!key.has(k)) key.set(k,i); wmap[i]=key.get(k);}
const idx = raw.map(k=>wmap[k]); console.log('welded uniq', key.size);
console.log('in', n, idx.length/3, 'normalized', pa.getNormalized());
const target = Math.floor(+targetTris * 3);
const [simp, err] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.5, []);
console.log('out tris', simp.length/3, 'err', err);
// compact vertices
const remap = new Map(); const P = []; const I = [];
for (const k of simp) { if (!remap.has(k)) { remap.set(k, P.length/3); P.push(pos[k*3],pos[k*3+1],pos[k*3+2]); } I.push(remap.get(k)); }
// normalize: center, scale so max extent = 1, y up
let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
for (let i=0;i<P.length;i+=3) for(let a=0;a<3;a++){mn[a]=Math.min(mn[a],P[i+a]);mx[a]=Math.max(mx[a],P[i+a]);}
console.log('bbox', mn, mx);
const c=[0,1,2].map(a=>(mn[a]+mx[a])/2); const s=Math.max(...[0,1,2].map(a=>(mx[a]-mn[a])/2));
const Q = new Int16Array(P.length); for (let i=0;i<P.length;i++) Q[i]=Math.round((P[i]-c[i%3])/s*32767);
const nv = P.length/3, nt = I.length/3;
const buf = Buffer.concat([Buffer.from(new Uint32Array([nv, nt]).buffer), Buffer.from(Q.buffer), Buffer.from(new Uint16Array(I).buffer)]);
fs.writeFileSync(out, `/* Janus: Double headed herm, The Fitzwilliam Museum, Cambridge (GR.20.1850), CC BY 4.0.\n   Decimated to ${nt} triangles by tools/janus-mesh.mjs. Int16 xyz, Uint16 tris. */\nwindow.JANUS_MESH = "${buf.toString('base64')}";\n`);
console.log('verts', nv, 'tris', nt, 'bytes', buf.length);
