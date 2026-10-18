# New-dog candidate sketches (head-on idle), same shared body/desk/paws pipeline.
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'breeds5.py')).read())
DOME='M70,340 C64,190 146,92 256,90 C366,92 448,190 442,340 Z'
def upear(x0,x1,tipx,tipy,fill,inner,m=False,rnd=10):
    d=f'M{x0},{170} C{x0-6},{120} {tipx-rnd},{tipy+rnd} {tipx},{tipy} C{tipx+rnd*1.6},{tipy+rnd} {x1},{110} {x1+10},{150} Z'
    di=f'M{x0+18},{160} C{x0+14},{124} {tipx-rnd*0.4+6},{tipy+34} {tipx+6},{tipy+28} C{tipx+rnd+10},{tipy+40} {x1-12},{118} {x1-6},{150} Z'
    f=(lambda s:mir(s)) if m else (lambda s:s)
    return f'<path d="{f(d)}" fill="{fill}" {A()}/><path d="{f(di)}" fill="{inner}"/>'
def dropear(cx,top,bot,w,fill,m=False):
    d=f'M{cx+w*0.6},{top} C{cx-w*0.3},{top-8} {cx-w},{top+40} {cx-w*0.9},{bot-30} C{cx-w*0.8},{bot+6} {cx-w*0.1},{bot+8} {cx+w*0.2},{bot-24} C{cx+w*0.5},{bot-70} {cx+w*0.4},{top+50} {cx+w*0.9},{top+20} Z'
    return f'<path d="{mir(d) if m else d}" fill="{fill}" {A()}/>'
def nose(y,w=26): return f'<path d="M{256-w},{y} C{256-w},{y-12} {256+w},{y-12} {256+w},{y} C{256+w},{y+14} {256+8},{y+20} 256,{y+20} C{256-8},{y+20} {256-w},{y+14} {256-w},{y} Z" fill="#120D0B"/><ellipse cx="{256-w*0.4:.0f}" cy="{y-4}" rx="7" ry="3" fill="#FFFFFF" fill-opacity="0.6"/>'
def mouth(y): return f'<path d="M256,{y} v8 M236,{y+16} q10,8 20,-2 q10,10 20,2" fill="none" stroke="#120D0B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
def eyesc(y,xs,r,iris=None):
    if not iris: return dot_eyes('open',r=r,y=y,xs=xs)
    return ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{iris}" stroke="#120D0B" stroke-width="4"/><circle cx="{x}" cy="{y}" r="{r*0.45:.1f}" fill="#120D0B"/><circle cx="{x-r*.35:.1f}" cy="{y-r*.35:.1f}" r="{r*.3:.1f}" fill="#FFFFFF"/>' for x in xs)
def clipd(uid,d,inner): return f'<clipPath id="nc-{uid}"><path d="{d}"/></clipPath><g clip-path="url(#nc-{uid})">{inner}</g>'
W='#FFFFFF'; WC='#FBF7F0'
def make(uid,fill,behind_fn,face_fn,headd=DOME):
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}">'+behind_fn()+'</g></g>'
    def face(k,t,bl): return face_fn(k,t,bl)
    return dict(headd=headd,headw=headd,behind=behind,face=face,fill=fill,fillvar=uid+'-fill')
def eyes_k(k,y,xs,r,iris=None): return eyesc(y,xs,r,iris) if k=='open' else dot_eyes(k,r=r,y=y,xs=xs)
# Corgi: orange+white blaze, huge upright ears
CO='#E39A4D'
BREEDS['corgi']=make('corgi',CO,lambda: upear(96,214,112,8,CO,'#F6B8B0')+upear(96,214,112,8,CO,'#F6B8B0',True),
  lambda k,t,bl: clipd('co',DOME,f'<path d="M256,120 C236,160 226,190 206,226 C170,236 150,262 150,300 L362,300 C362,262 342,236 306,226 C286,190 276,160 256,120 Z" fill="{WC}"/>')+bl+eyes_k(k,200,(178,334),22)+nose(236,22)+mouth(254)+tongue(t,256,272,8,11))
# Shiba: red, white cheeks (urajiro), eyebrow dots, smaller forward ears, almond-ish eyes
SH='#D9853B'
BREEDS['shiba']=make('shiba',SH,lambda: upear(118,214,140,42,SH,WC)+upear(118,214,140,42,SH,WC,True),
  lambda k,t,bl: clipd('sh',DOME,f'<path d="M90,340 C96,270 150,230 206,226 C226,236 240,212 256,212 C272,212 286,236 306,226 C362,230 416,270 422,340 Z" fill="{WC}"/>')+f'<ellipse cx="184" cy="166" rx="13" ry="8" fill="{WC}"/><ellipse cx="328" cy="166" rx="13" ry="8" fill="{WC}"/>'+bl+eyes_k(k,196,(186,326),18)+nose(234,20)+mouth(252)+tongue(t,256,270,8,11))
# Husky: grey cap with widow's peak, white face mask, blue eyes, upright ears
HU='#7E8792'
BREEDS['husky']=make('husky',HU,lambda: upear(100,214,120,20,HU,WC)+upear(100,214,120,20,HU,WC,True),
  lambda k,t,bl: clipd('hu',DOME,f'<path d="M60,340 C60,250 100,180 150,170 C176,166 196,190 214,180 C230,170 240,150 256,150 C272,150 282,170 298,180 C316,190 336,166 362,170 C412,180 452,250 452,340 Z" fill="{WC}"/><path d="M226,96 L256,176 L286,96 Z" fill="{HU}"/>')+bl+eyes_k(k,206,(184,328),22,'#7FC4EE')+nose(240,22)+mouth(258)+tongue(t,256,276,8,11))
# Beagle: tan head, white blaze + muzzle, long dark-brown drop ears
BE='#C98A4B'; BED='#7A4E2B'
BREEDS['beagle']=make('beagle',BE,lambda:'',
  lambda k,t,bl: clipd('be',DOME,f'<path d="M256,110 C244,150 238,180 226,210 C190,222 172,256 176,300 L336,300 C340,256 322,222 286,210 C274,180 268,150 256,110 Z" fill="{WC}"/>')+dropear(96,130,300,52,BED)+dropear(96,130,300,52,BED,True)+bl+eyes_k(k,200,(182,330),23)+nose(238,24)+mouth(256)+tongue(t,256,274,8,11))
# Dalmatian: white with black spots, black drop ears
DA=WC
spots=''.join(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.85:.1f}" fill="#1C1512"/>' for x,y,r in [(150,150,12),(214,120,9),(300,128,11),(360,170,13),(120,230,10),(392,236,9),(250,170,7),(330,250,8),(166,262,8)])
BREEDS['dalmatian']=make('dalmatian',DA,lambda:'',
  lambda k,t,bl: clipd('da',DOME,spots)+dropear(100,128,270,44,'#1C1512')+dropear(100,128,270,44,'#1C1512',True)+bl+eyes_k(k,204,(184,328),23)+nose(240,24)+mouth(258)+tongue(t,256,276,8,11))
# Dachshund: red, long low drop ears, longer narrow snout
DX='#B5653A'; DXD='#8A4526'
BREEDS['dachshund']=make('dachshund',DX,lambda:'',
  lambda k,t,bl: dropear(108,150,320,48,DXD)+dropear(108,150,320,48,DXD,True)+f'<path d="M210,190 C214,220 222,262 256,268 C290,262 298,220 302,190" fill="none" {A(w=6)}/>'+bl+eyes_k(k,186,(188,324),20)+nose(246,18)+mouth(264)+tongue(t,256,282,7,10),
  headd='M84,340 C78,194 152,96 256,94 C360,96 434,194 428,340 Z')
# Golden retriever: golden, soft feathered drop ears, lighter muzzle
GO='#E8B866'; GOD='#D39A45'
BREEDS['golden']=make('golden',GO,lambda:'',
  lambda k,t,bl: f'<path d="{scallop(98,206,40,80,-90,270,10,6)}Z" fill="{GOD}" {A()}/><path d="{mir(scallop(98,206,40,80,-90,270,10,6))}Z" fill="{GOD}" {A()}/>'+f'<ellipse cx="256" cy="254" rx="62" ry="42" fill="#F3D6A0"/>'+bl+eyes_k(k,200,(186,326),22)+nose(238,24)+mouth(256)+tongue(t,256,274,8,11))
# Black lab: black/dark coat, drop ears, warm brown eyes (shown with light ink outline)
LB='#2B2522'
BREEDS['blacklab']=make('blacklab',LB,lambda:'',
  lambda k,t,bl: dropear(100,130,262,42,'#1A1513')+dropear(100,130,262,42,'#1A1513',True)+bl+(eyesc(202,(186,326),20,'#8A5A2E') if k=='open' else '')+f'<ellipse cx="256" cy="252" rx="56" ry="38" fill="#3A322E"/>'+nose(238,24)+f'<path d="M256,258 v8 M236,274 q10,8 20,-2 q10,10 20,2" fill="none" stroke="#9A8F88" stroke-width="5" stroke-linecap="round"/>'+tongue(t,256,280,8,11))
CANDS=['corgi','shiba','husky','beagle','dalmatian','dachshund','golden','blacklab']
