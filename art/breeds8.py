# The new four, cozy plushie pass: Huskie, Corgie, Shibie, Goldie.
# Big warm kawaii eyes (Puggie-sized), rounded plush ears with inner fur, soft markings, blush, small happy mouths.
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'breeds_new.py')).read())
MW=V('mark-white','#FBF7F0')
def ML(c): return f'stroke="{V("mark-line",c)}" stroke-width="4" stroke-linejoin="round"'
def tuftz(pts,w=4.5):
    return ''.join(f'<path d="M{x},{y} q{dx*0.5:.0f},-8 {dx},{dy}" fill="none" stroke="{INK}" stroke-width="{w}" stroke-linecap="round"/>' for x,y,dx,dy in pts)
def mirpts(pts): return [(512-x,y,-dx,dy) for x,y,dx,dy in pts]
def cheeks(pts): return tuftz(pts)+tuftz(mirpts(pts))
def kawaii(k,y,xs,iris,r=24,extra='',lid=None,squint=False):
    """family eye: big dark eye, soft coloured iris ring, big + small catchlights (Puggie style), gentle per-breed accents"""
    if k=='closed': return dot_eyes('closed',y=y,xs=xs)
    if k=='happy' or squint: return ''.join(f'<path d="M{x-20},{y+6} q20,-24 40,0" fill="none" {A(w=7)}/>' for x in xs)
    s=''; iris=iris if iris.startswith("var") else V("eye-iris",iris)
    for x in xs:
        s+=(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#120D0B"/><circle cx="{x}" cy="{y+3}" r="{r*0.7:.1f}" fill="{iris}" fill-opacity="0.85"/><circle cx="{x}" cy="{y+3}" r="{r*0.38:.1f}" fill="#120D0B"/>'
            f'<circle cx="{x-8}" cy="{y-8}" r="8.5" fill="#FFFFFF"/><circle cx="{x+9}" cy="{y+10}" r="3.6" fill="#FFFFFF"/>')
        if extra=='sparkle': s+=f'<circle cx="{x+11}" cy="{y-11}" r="2.6" fill="#FFFFFF"/><circle cx="{x-11}" cy="{y+8}" r="1.8" fill="#FFFFFF"/>'
        if lid: s+=f'<path d="M{x-26},{y-6} Q{x},{y-30} {x+26},{y-6} Q{x},{y-18} {x-26},{y-6} Z" fill="{lid}"/><path d="M{x-27},{y-5} Q{x},{y-21} {x+27},{y-5}" fill="none" stroke="#120D0B" stroke-width="5" stroke-linecap="round"/>'
    return s
def happymouth(y,open_=False,t=False):
    if open_:
        return (f'<path d="M256,{y-14} v10 M234,{y} C236,{y+22} 276,{y+22} 278,{y} Q256,{y+8} 234,{y} Z" fill="#7A2E2E" stroke="#120D0B" stroke-width="5" stroke-linejoin="round"/>'
                f'<path d="M244,{y+9} C246,{y+20} 266,{y+20} 268,{y+9} Q256,{y+13} 244,{y+9} Z" fill="{BEAN}"/>')
    return f'<path d="M256,{y-12} v8 M238,{y} q9,8 18,-2 q9,10 18,2" fill="none" stroke="#120D0B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'+tongue(t,256,y+6,7,10)
def softear(base_l,base_r,tip,inner,fill,fur,m=False,lean=0):
    (x0,y0),(x1,y1),(tx,ty)=base_l,base_r,tip
    d=f'M{x0},{y0} C{x0-8},{y0-50} {tx-34},{ty+8} {tx},{ty} C{tx+30},{ty-4} {x1+4},{y1-50} {x1},{y1} Z'
    di=f'M{x0+16},{y0-8} C{x0+10},{y0-46} {tx-18},{ty+24} {tx+2},{ty+20} C{tx+22},{ty+18} {x1-8},{y1-44} {x1-12},{y1-8} Z'
    fl=f'M{x0+22},{y0-6} q2,-24 10,-38 q4,18 2,30 q8,-22 18,-32 q-2,20 -6,40 Z'
    g=f'<g transform="rotate({lean} {(x0+x1)/2} {y0})"><path d="{d}" fill="{fill}" {A()}/><path d="{di}" fill="{inner}"/><path d="{fl}" fill="{fur}" {A(w=3)}/></g>'
    return f'<g transform="translate(512,0) scale(-1,1)">{g}</g>' if m else g
# ---- Huskie: soft grey, rounded ears with fluffy inner fur, mask + brow dots, sweet soft-blue eyes
HUF=V('huskie-fill','#8A939E'); HUE=V('huskie-eye','#8CC8EC'); HUI=V('huskie-ear','#F2C9C4')
def hus_face(k,t,bl):
    mask=(f'<path d="M60,340 C60,256 98,190 148,180 C174,176 194,196 214,188 C232,180 242,160 256,160 C270,160 280,180 298,188 C318,196 338,176 364,180 C414,190 452,256 452,340 Z" fill="{MW}" {ML("#FBF7F0")}/>'
          f'<path d="M238,96 C246,130 252,150 256,168 C260,150 266,130 274,96 Z" fill="{HUF}"/>')
    dots=f'<ellipse cx="184" cy="160" rx="12" ry="8" fill="{MW}" {ML("#FBF7F0")}/><ellipse cx="328" cy="160" rx="12" ry="8" fill="{MW}" {ML("#FBF7F0")}/>'
    return clipd('hu8',DOME,mask)+dots+cheeks([(96,262,-14,10),(104,286,-14,12)])+bl+kawaii(k,208,(186,326),HUE)+nose(242,22)+happymouth(266,t=t)
BREEDS['huskie']=make('huskie',HUF,lambda: softear((96,176),(212,140),(122,30),HUI,HUF,MW,lean=-6)+softear((96,176),(212,140),(122,30),HUI,HUF,MW,True,lean=-6),hus_face)
# ---- Corgie: huge rounded ears with fluffy inner ear, bold blaze + white muzzle, extra-sparkly eyes, goofy open grin
COF=V('corgie-fill','#E0843A'); COI=V('corgie-ear','#F6B8B0')
def cor_face(k,t,bl):
    blaze=f'<path d="M256,104 C248,140 240,172 228,200 C192,208 160,238 156,300 L356,300 C352,238 320,208 284,200 C272,172 264,140 256,104 Z" fill="{MW}" {ML("#FBF7F0")}/>'
    return clipd('co8',DOME,blaze)+cheeks([(92,262,-14,10),(100,286,-14,12)])+bl+kawaii(k,198,(178,334),'#6B3E22',r=25,extra='sparkle')+nose(232,22)+happymouth(256,open_=True)
BREEDS['corgie']=make('corgie',COF,lambda: softear((86,184),(226,140),(100,-6),COI,COF,MW,lean=-4)+softear((86,184),(226,140),(100,-6),COI,COF,MW,True,lean=-4),cor_face)
# ---- Shibie: red coat, rounded thick forward ears with cream inner fur, urajiro cheeks + brow dots, gently upturned happy eyes
SHF=V('shibie-fill','#D0712F'); SHC=V('shibie-cream','#F8E6C8')
def shi_face(k,t,bl):
    ura=f'<path d="M80,340 C82,278 128,240 182,234 C208,232 226,222 238,206 C246,198 266,198 274,206 C286,222 304,232 330,234 C384,240 430,278 432,340 Z" fill="{SHC}" {ML("#F8E6C8")}/>'
    brows=f'<ellipse cx="186" cy="162" rx="13" ry="8" fill="{SHC}" {ML("#F8E6C8")}/><ellipse cx="326" cy="162" rx="13" ry="8" fill="{SHC}" {ML("#F8E6C8")}/>'
    ey=kawaii(k,198,(186,326),'#7A4322',r=23)
    if k=='open': ey+=''.join(f'<path d="M{x-18*s},{204} q{20*s},10 {34*s},-4" fill="none" stroke="{SHF}" stroke-width="0"/>' for x,s in ((186,1),(326,-1)))
    return clipd('sh8',DOME,ura)+brows+cheeks([(86,286,-14,10),(94,308,-12,12)])+bl+ey+nose(236,19)+happymouth(258,t=t)
BREEDS['shibie']=make('shibie',SHF,lambda: softear((132,156),(222,136),(160,44),SHC,SHF,SHC,lean=4)+softear((132,156),(222,136),(160,44),SHC,SHF,SHC,True,lean=4),shi_face,headd='M78,340 C72,196 150,100 256,98 C362,100 440,196 434,340 Z')
BREEDS['shibie-squint']=make('shibie-squint',SHF,lambda: softear((132,156),(222,136),(160,44),SHC,SHF,SHC,lean=4)+softear((132,156),(222,136),(160,44),SHC,SHF,SHC,True,lean=4),
    lambda k,t,bl: shi_face('happy' if k=='open' else k,t,bl),headd='M78,340 C72,196 150,100 256,98 C362,100 440,196 434,340 Z')
# ---- Goldie: rich golden, feathered wavy floppy ears with fold, muzzle shading, warm brown eyes with soft lids, gentle smile
GOF=V('goldie-fill','#D9A441'); GOE=V('goldie-ear','#B97A2A'); GOM=V('goldie-muzzle','#EFC983')
def feather(m):
    d='M152,118 C110,108 74,148 70,204 C68,236 74,262 86,284 Q94,272 100,292 Q110,280 116,298 Q124,282 134,292 C142,250 148,208 168,158 Z'
    crease='M150,128 q-30,4 -46,30'
    strands=['M94,220 q-4,24 4,48','M112,214 q-2,26 6,54']
    f=(lambda s:mir(s)) if m else (lambda s:s); g=(lambda s:mirq(s)) if m else (lambda s:s)
    return (f'<path d="{f(d)}" fill="{GOE}" {A()}/><path d="{g(crease)}" fill="none" {A(w=5)}/>'
            +''.join(f'<path d="{g(x)}" fill="none" stroke="#120D0B" stroke-opacity="0.35" stroke-width="3.5" stroke-linecap="round"/>' for x in strands))
def gol_face(k,t,bl):
    muz=f'<ellipse cx="256" cy="252" rx="60" ry="40" fill="{GOM}" {ML("#EFC983")}/><path d="M226,264 C236,286 276,286 286,264 C276,274 236,274 226,264 Z" fill="{GOE}" fill-opacity="0.3"/>'
    tuft=f'<path d="M242,106 q10,12 4,26 M264,104 q8,14 0,28" fill="none" {A(w=5)}/>'
    return feather(0)+feather(1)+tuft+cheeks([(150,276,-12,10)])+muz+bl+kawaii(k,202,(186,326),'#9A6232',r=24,lid=GOF)+nose(238,24)+happymouth(262,t=t)
BREEDS['goldie']=make('goldie',GOF,lambda:'',gol_face)
NEW4=['huskie','corgie','shibie','goldie']
# ---- Tuckie v4: no small curl dots/rings anywhere; curliness = scalloped outline + a few big soft C-waves + plush cheek tufts
def tuck4():
    b=BREEDS['tuck3B']; head=b['headd']
    top=scallop(256,98,58,36,160,380,8,14)+'Z'
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}"><path d="{top}" fill="{TF2}" {A()}/></g></g>'
    def wave(d): return f'<path d="{d}" fill="none" {A(w=5)}/>'
    def face(k,t,bl):
        win=(k=='happy')
        ex,ey,ry=(112,236,78) if win else (90,246,96)
        e=scallop(ex,ey,40,ry,-90,270,16,9)+'Z'
        ears=''.join(f'<path d="{mir(e) if m else e}" fill="{TE2}" {A()}/>' for m in (0,1))
        ew=''.join(wave(mirq(d) if m else d) for m in (0,1) for d in [f'M{ex-12},{ey-ry*0.45:.0f} q-12,18 2,34',f'M{ex+6},{ey+ry*0.15:.0f} q-12,18 2,34'])
        topw=wave('M238,92 q-10,14 4,26')+wave('M276,92 q10,14 -4,26')
        fw=wave('M150,150 q-12,14 0,28')+wave(mirq('M150,150 q-12,14 0,28'))
        ch=cheeks([(150,262,-12,10),(156,282,-12,10)])
        y=202; xs=(198,314)
        eyes_=kawaii(k,y,xs,'#6B3E22',r=24)
        muz=(f'<path d="{scallop(256,248,48,36,0,360,10,5)}Z" fill="{PAW}" {A(w=5)}/>'
             f'<circle cx="256" cy="236" r="13" fill="#120D0B"/><ellipse cx="251" cy="231" rx="4.5" ry="3" fill="#FFFFFF" fill-opacity="0.7"/>'+happymouth(260,t=(t or win)))
        return ears+ew+topw+fw+ch+bl+eyes_+muz
    return dict(headd=head,headw=head,behind=behind,face=face,fill=TF2,fillvar='tuckie-fill')
BREEDS['tuckie']=tuck4()
# ---- final polish: Goldie simpler/plush, Shibie cozier urajiro + rounder plush ears
def feather3(m):
    d='M150,118 C108,110 74,150 72,206 C70,240 78,266 90,286 Q100,276 108,292 Q118,282 128,290 C140,250 148,208 168,158 Z'
    crease='M146,130 q-24,6 -36,28'
    f=(lambda s:mir(s)) if m else (lambda s:s); g=(lambda s:mirq(s)) if m else (lambda s:s)
    return f'<path d="{f(d)}" fill="{GOE}" {A()}/><path d="{g(crease)}" fill="none" {A(w=5)}/>'
def gol_face3(k,t,bl):
    muz=f'<ellipse cx="256" cy="252" rx="58" ry="38" fill="{GOM}" {ML("#EFC983")}/>'
    return feather3(0)+feather3(1)+muz+bl+kawaii(k,202,(186,326),'#9A6232',r=24)+nose(238,24)+happymouth(262,t=t)
BREEDS['goldie']=make('goldie',GOF,lambda:'',gol_face3); _wrap('goldie') if False else None
def plushear(m):
    d='M130,158 C124,120 136,76 158,54 C168,44 180,44 190,54 C210,76 224,112 228,144 Z'
    di='M148,148 C146,118 154,88 168,72 C174,66 180,66 186,72 C198,90 208,118 210,142 Z'
    fl='M152,146 q2,-18 10,-30 q4,14 2,26 q6,-16 14,-24 q0,16 -4,30 Z'
    g=f'<g transform="rotate(4 180 150)"><path d="{d}" fill="{SHF}" {A()}/><path d="{di}" fill="{SHC}"/><path d="{fl}" fill="{SHC}" {A(w=3)}/></g>'
    return f'<g transform="translate(512,0) scale(-1,1)">{g}</g>' if m else g
def shi_face3(k,t,bl):
    ura=f'<path d="M82,340 C80,284 120,246 170,240 C200,236 222,230 236,214 C244,204 268,204 276,214 C290,230 312,236 342,240 C392,246 432,284 430,340 Z" fill="{SHC}" {ML("#F8E6C8")}/>'
    brows=f'<ellipse cx="186" cy="164" rx="14" ry="9" fill="{SHC}" {ML("#F8E6C8")}/><ellipse cx="326" cy="164" rx="14" ry="9" fill="{SHC}" {ML("#F8E6C8")}/>'
    return clipd('sh9',DOME,ura)+brows+cheeks([(100,262,-12,10)])+bl+kawaii(k,198,(186,326),'#7A4322',r=24)+nose(236,19)+happymouth(258,t=t)
BREEDS['shibie']=make('shibie',SHF,lambda: plushear(0)+plushear(1),shi_face3,headd='M78,340 C72,196 150,100 256,98 C362,100 440,196 434,340 Z')
