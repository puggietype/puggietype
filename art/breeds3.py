# Round 3: cuter Chowie (big soft eyes, muzzle above paws, jaw ruff, tiny ears), instant-read Tuckie, Frenchie winner ears.
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'breeds2.py')).read())
CT=V('chow-tongue','#4B4466')
def chow3(v):
    # round lion/teddy fluff ball: wide cheeks, irregular tufts
    left=[(4,346),(8,318),(16,292),(28,266),(42,240),(60,214),(82,190),(108,166),(140,144),(176,128),(214,118),(256,114)]
    amps=[0,15,18,13,17,13,12,8,6,4,3,2]
    head=furry(left,amps,seed=8)
    es={'A':0.62,'B':0.72,'C':0.82}[v]; ex,ey=118,128
    def earp(m):
        d=f'M{ex-40*es:.1f},{ey+70*es:.1f} C{ex-36*es:.1f},{ey+30*es:.1f} {ex-14*es:.1f},{ey-14*es:.1f} {ex:.1f},{ey-14*es:.1f} C{ex+14*es:.1f},{ey-14*es:.1f} {ex+40*es:.1f},{ey+30*es:.1f} {ex+50*es:.1f},{ey+70*es:.1f} Z'
        di=f'M{ex-20*es:.1f},{ey+50*es:.1f} C{ex-20*es:.1f},{ey+24*es:.1f} {ex-8*es:.1f},{ey+4*es:.1f} {ex+2*es:.1f},{ey+4*es:.1f} C{ex+14*es:.1f},{ey+6*es:.1f} {ex+22*es:.1f},{ey+26*es:.1f} {ex+24*es:.1f},{ey+50*es:.1f} Z'
        return f'<path d="{mir(d) if m else d}" fill="{CF}" {A()}/><path d="{mir(di) if m else di}" fill="{CE}"/>'
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}">'+earp(0)+earp(1)+'</g></g>'
    y=186; xl,xr=(186,326)
    def face(k,t,bl):
        fl=['M92,196 q-10,16 2,34','M126,166 q-8,12 0,24','M248,140 q4,10 0,20','M268,142 q4,10 -2,20']
        fur=''.join(f'<path d="{d}" fill="none" {A(w=5)}/>' for d in fl)+''.join(f'<path d="{mirq(d)}" fill="none" {A(w=5)}/>' for d in fl[:2])
        # thick jaw ruff: soft tufted band under the muzzle, widening into the cheeks
        ruff=furry([(120,300),(126,282),(150,272),(190,268),(256,272)],[0,6,7,7,6],seed=4,lean=0.5)
        ruffl=''.join(f'<path d="{d}" fill="none" {A(w=5)}/>' for d in ['M196,286 q6,-10 14,-2','M232,290 q6,-10 14,-2','M268,290 q6,-10 14,-2','M304,286 q6,-10 14,-2'])
        sock=''.join(f'<ellipse cx="{x}" cy="{y}" rx="34" ry="28" fill="{SHADE}" fill-opacity="0.7"/>' for x in (xl,xr))
        brow=f'<path d="M{xl-24},{y-30} q22,-8 42,2 M{xr+24},{y-30} q-22,-8 -42,2" fill="none" {A(w=6)}/>'
        if k=='open':
            r={'A':22,'B':22,'C':20}[v]
            eyes_=''.join(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.86:.1f}" fill="#120D0B"/><circle cx="{x-r*.32:.1f}" cy="{y-r*.3:.1f}" r="{r*.34:.1f}" fill="#FFFFFF"/><circle cx="{x+r*.36:.1f}" cy="{y+r*.34:.1f}" r="{r*.15:.1f}" fill="#FFFFFF"/>' for x in (xl,xr))
        else: eyes_=dot_eyes(k,r=20,y=y,xs=(xl,xr))
        w=62
        muz=(f'<path d="M{256-w},{252} C{256-w-4},{224} {256-w+10},{206} {256-w+30},{204} L{256+w-30},{204} C{256+w-10},{206} {256+w+4},{224} {256+w},{252} C{256+w-18},{266} {256-w+18},{266} {256-w},{252} Z" fill="{CM}"/>'
             f'<path d="M{256-w+4},{218} C{256-w-4},{236} {256-w+4},{258} {256-24},{260} M{256+w-4},{218} C{256+w+4},{236} {256+w-4},{258} {256+24},{260}" fill="none" {A(w=6)}/>'
             f'<path d="M226,214 C226,203 286,203 286,214 C286,228 268,236 256,236 C244,236 226,228 226,214 Z" fill="#120D0B"/><ellipse cx="244" cy="211" rx="8" ry="3.4" fill="#FFFFFF" fill-opacity="0.55"/>'
             f'<path d="M256,236 v8 M226,256 C236,248 248,248 256,244 C264,248 276,248 286,256" fill="none" stroke="#120D0B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>')
        tg=f'<path d="M249,252 h14 q0,13 -7,13 q-7,0 -7,-13 Z" fill="{CT}" stroke="#120D0B" stroke-width="3" stroke-linejoin="round"/>' if (v!='B' and (t or k=='happy')) else ''
        return (f'<path d="{ruff}" fill="{CF}" {A(w=6)}/>'+ruffl if v!='C' else '')+fur+sock+brow+bl+eyes_+muz+tg
    return dict(headd=head,headw=head,behind=behind,face=face,fill=CF,fillvar='chow-fill')
# Tuckie: curly fluff head, long curly floppy ears, big button eyes, round puff muzzle
TF2=V('tuckie-fill','#F7E3C6'); TE2=V('tuckie-ear','#E2A873')
def curl(x,y,s=1,w=4,c=None):
    return f'<path d="M{x-7*s:.1f},{y+3*s:.1f} q0,-10 8,-10 q8,0 8,8 q0,6 -6,6" fill="none" stroke="{c or INK}" stroke-width="{w}" stroke-linecap="round"/>'
def tuck3(v):
    head=furry([(70,346),(66,300),(70,256),(84,212),(108,172),(142,140),(186,118),(222,104),(256,100)],[0,5,6,6,6,6,6,6,5],seed=11,lean=0.5)
    top=scallop(256,98,58,36,160,380,8,14)+'Z'
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}"><path d="{top}" fill="{TF2}" {A()}/></g></g>'
    def face(k,t,bl):
        win=(k=='happy')
        # long floppy curly ears; in winner they tuck in/shorten so the raised arms don't cover them
        ex,ey,ry=(112,236,78) if win else ((84,250,104) if v=='A' else (90,246,96))
        e=scallop(ex,ey,40,ry,-90,270,16,9)+'Z'
        ears=''.join(f'<path d="{mir(e) if m else e}" fill="{TE2}" {A()}/>' for m in (0,1))
        ec=''.join(curl(x if m==0 else 512-x,yy,1.0,4) for m in (0,1) for x,yy in [(ex-8,ey-ry*0.55),(ex+10,ey-ry*0.15),(ex-10,ey+ry*0.2),(ex+8,ey+ry*0.55)])
        topc=''.join(curl(x,yy,1.1,4) for x,yy in [(222,96),(256,84),(290,96),(238,118),(274,118)])
        facec=''.join(curl(x,yy,0.9,3.5) for x,yy in [(150,160),(362,160),(196,140),(316,140),(150,212),(362,212)])
        y=200; xs=(198,314)
        eyes_=dot_eyes(k,r=24,y=y,xs=xs,hi=8) if not win else dot_eyes(k,r=22,y=y,xs=xs)
        muz=(f'<path d="{scallop(256,246,48,36,0,360,12,5)}Z" fill="{PAW}" {A(w=5)}/>'
             f'<circle cx="256" cy="234" r="13" fill="#120D0B"/><circle cx="251" cy="230" r="4" fill="#FFFFFF" fill-opacity="0.7"/>'
             f'<path d="M256,247 v6 M242,258 q7,6 14,-1 q7,7 14,1" fill="none" stroke="#120D0B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'+tongue(t or win,256,262,7,10))
        return ears+ec+topc+facec+bl+eyes_+muz
    return dict(headd=head,headw=head,behind=behind,face=face,fill=TF2,fillvar='tuckie-fill')
for v in 'ABC': BREEDS['chow3'+v]=chow3(v)
for v in 'AB': BREEDS['tuck3'+v]=tuck3(v)
# Frenchie winner: tilt ears outward so they clear the celebration ticks
_fb=BREEDS['frenB']; _fbb=_fb['behind']
def _fren_behind(tf):
    s=_fbb(tf)
    if 'scale(0.9)' not in tf: return s
    head=f'<g clip-path="url(#pt-head)"><g transform="{tf}">'
    body=s[len(head):-len('</g></g>')]
    el=[e+'/>' for e in body.split('/>') if e]
    assert len(el)==4
    return head+f'<g transform="rotate(-14 160 180)">{el[0]}{el[1]}</g><g transform="rotate(14 352 180)">{el[2]}{el[3]}</g></g></g>'
FREN3=dict(_fb); FREN3['behind']=_fren_behind; BREEDS['frenchie']=FREN3
# Chow 3D: lion face-in-mane read: lighter tufted face disc inside a deeper-cream mane, no ruff over paws
CMANE=V('chow-mane','#F1E2C6')
def chow3D():
    b=chow3('C'); f0=b['face']
    disc=furry([(122,380),(112,300),(112,262),(114,222),(124,186),(144,156),(174,134),(212,122),(256,118)],[0,0,7,8,7,7,6,5,4],seed=21,lean=0.55)
    def face(k,t,bl):
        if k=='happy': return f0(k,t,bl)
        return f'<path d="{disc}" fill="{CF}" stroke="none"/>'+''.join(f'<path d="{d}" fill="none" {A(w=5)}/>' for d in ['M124,186 q-14,18 -10,40','M114,236 q-8,18 2,34','M388,186 q14,18 10,40','M398,236 q8,18 -2,34','M156,150 q-14,8 -18,22','M356,150 q14,8 18,22'])+f0(k,t,bl)
    d=dict(b); d['face']=face; d['fill']=CMANE; return d
BREEDS['chow3D']=chow3D()
BREEDS['chow3D']=chow3D()
BREEDS['chowie']=BREEDS['chow3D']; BREEDS['tuckie']=BREEDS['tuck3B']
