# Round 2: Chowie (teddy/lion fluff ball) and Frenchie (square head, wide bat ears) variants.
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'breeds.py')).read())
import random
def smooth(pts,close=True):
    """Catmull-Rom through pts -> cubic path"""
    d=f'M{pts[0][0]:.1f},{pts[0][1]:.1f} '; n=len(pts)
    for i in range(n-1):
        p0=pts[max(i-1,0)]; p1=pts[i]; p2=pts[i+1]; p3=pts[min(i+2,n-1)]
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+=f'C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} '
    return d+('Z' if close else '')
def furry(left,amps,seed=3,lean=0.45):
    """left-half outline (bottom-left -> top centre), irregular soft fur tufts, mirrored with tiny jitter"""
    rnd=random.Random(seed); segs=[]
    for i in range(len(left)-1):
        (x1,y1),(x2,y2)=left[i],left[i+1]; dx,dy=x2-x1,y2-y1; L=math.hypot(dx,dy) or 1
        nx,ny=dy/L,-dx/L
        if nx>0: nx,ny=-nx,-ny
        amp=amps[i]*(0.75+0.5*rnd.random())
        cx,cy=x1+dx*lean+nx*amp*1.6,y1+dy*lean+ny*amp*1.6
        segs.append(((cx,cy),(x2,y2),amp))
    d=f'M{left[0][0]:.1f},{left[0][1]:.1f} '
    for (cx,cy),(x2,y2),amp in segs: d+=(f'Q{cx:.1f},{cy:.1f} {x2:.1f},{y2:.1f} ' if amp>=1 else f'L{x2:.1f},{y2:.1f} ')
    pts=[left[0]]+[e for _,e,_ in segs]
    for i in range(len(segs)-1,-1,-1):
        (cx,cy),_,amp=segs[i]; x2,y2=pts[i]
        j=rnd.uniform(-3,3)
        d+=(f'Q{512-cx+j:.1f},{cy+j:.1f} {512-x2:.1f},{y2:.1f} ' if amp>=1 else f'L{512-x2:.1f},{y2:.1f} ')
    return d+'Z'
CHIN=V('chow-chin','#BDB6AE'); SHADE=V('chow-shade','#D9CDB9')
def chow_variant(v):
    if v=='A':   # bell-shaped fluff ball, widest at cheeks
        left=[(18,346),(22,318),(30,290),(40,262),(50,236),(64,210),(82,186),(104,162),(132,138),(166,118),(208,104),(256,98)]
        amps=[0,10,14,9,15,11,13,8,6,4,3,2]; ear=(112,92,0.85); eyes=(194,318,200); mz=1.0
    elif v=='B': # rounder teddy bear, ears more visible
        left=[(30,346),(32,312),(38,280),(48,250),(60,222),(78,192),(100,166),(128,142),(162,122),(206,108),(256,104)]
        amps=[0,8,11,8,12,9,7,5,4,3,2]; ear=(120,80,0.95); eyes=(194,318,198); mz=1.05
    else:        # lion: very wide cheek/neck ruff, small buried ears, stronger scowl
        left=[(6,346),(10,320),(18,296),(28,272),(42,248),(58,224),(78,200),(102,176),(132,150),(168,128),(210,112),(256,106)]
        amps=[0,14,18,12,16,13,14,9,6,4,3,2]; ear=(116,104,0.8); eyes=(196,316,202); mz=1.0
    head=furry(left,amps,seed={'A':3,'B':5,'C':8}[v])
    ex,ey,es=ear
    def earp(m):
        d=f'M{ex-44*es:.1f},{ey+70*es:.1f} C{ex-36*es:.1f},{ey+30*es:.1f} {ex-14*es:.1f},{ey-14*es:.1f} {ex:.1f},{ey-14*es:.1f} C{ex+14*es:.1f},{ey-14*es:.1f} {ex+40*es:.1f},{ey+30*es:.1f} {ex+50*es:.1f},{ey+70*es:.1f} Z'
        di=f'M{ex-24*es:.1f},{ey+52*es:.1f} C{ex-24*es:.1f},{ey+22*es:.1f} {ex-10*es:.1f},{ey+8*es:.1f} {ex+2*es:.1f},{ey+8*es:.1f} C{ex+16*es:.1f},{ey+10*es:.1f} {ex+26*es:.1f},{ey+28*es:.1f} {ex+28*es:.1f},{ey+52*es:.1f} Z'
        return f'<path d="{mir(d) if m else d}" fill="{CF}" {A()}/><path d="{mir(di) if m else di}" fill="{CE}"/>'
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}">'+earp(0)+earp(1)+'</g></g>'
    xl,xr,y=eyes
    def face(k,t,bl):
        # soft fur strands inside (cheeks + forehead), irregular, no ring
        fl=['M96,188 q-10,16 2,34','M120,214 q-8,14 4,28','M128,160 q-8,12 0,24','M104,246 q-6,10 2,20','M248,120 q4,10 0,20','M268,122 q4,10 -2,20']
        fur=''.join(f'<path d="{d}" fill="none" {A(w=5)}/>' for d in fl)+''.join(f'<path d="{mirq(d)}" fill="none" {A(w=5)}/>' for d in fl[:4])
        brow=(f'<path d="M{xl-24},{y-24} q22,-6 40,6 M{xr+24},{y-24} q-22,-6 -40,6" fill="none" {A(w=7)}/>'
              f'<path d="M{xl-26},{y-14} q24,-14 46,6 M{xr+26},{y-14} q-24,-14 -46,6" fill="{SHADE}" fill-opacity="0.0" stroke="{SHADE}" stroke-width="10" stroke-linecap="round" stroke-opacity="0.8"/>')
        sock=''.join(f'<ellipse cx="{x}" cy="{y-2}" rx="30" ry="18" fill="{SHADE}" fill-opacity="0.75"/>' for x in (xl,xr))
        if k=='open':
            eyes_=''.join(f'<path d="M{x-17},{y+2} Q{x},{y-17} {x+21},{y-3} Q{x+2},{y+15} {x-21},{y+2} Z" fill="#120D0B" stroke="#120D0B" stroke-width="3" stroke-linejoin="round" transform="rotate({s*-8} {x} {y})"/><circle cx="{x-4*s if s>0 else x+4}" cy="{y-3}" r="4.4" fill="#FFFFFF"/>' for x,s in ((xl,1),(xr,-1)))
        else: eyes_=dot_eyes(k,r=16,y=y,xs=(xl,xr))
        w=60*mz
        muz=(f'<path d="M{256-w},{286} C{256-w-6},{246} {256-w+8},{218} {256-w+30},{214} L{256+w-30},{214} C{256+w-8},{218} {256+w+6},{246} {256+w},{286} C{256+w-20},{298} {256-w+20},{298} {256-w},{286} Z" fill="{CM}" fill-opacity="0.9"/>'
             f'<path d="M{256-w+6},{232} C{256-w-4},{258} {256-w+8},{284} {256-26},{284} M{256+w-6},{232} C{256+w+4},{258} {256+w-8},{284} {256+26},{284}" fill="none" {A(w=6)}/>'
             f'<path d="M232,286 C240,278 272,278 280,286 C272,294 240,294 232,286 Z" fill="{CHIN}" fill-opacity="0.7"/>'
             f'<path d="M226,228 C226,218 286,218 286,228 C286,242 268,250 256,250 C244,250 226,242 226,228 Z" fill="#120D0B"/><ellipse cx="244" cy="226" rx="8" ry="3.4" fill="#FFFFFF" fill-opacity="0.55"/>'
             f'<path d="M256,250 v10 M222,276 C232,266 246,266 256,260 C266,266 280,266 290,276" fill="none" stroke="#120D0B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'+tongue(t,256,272,7,10))
        return fur+sock+brow+bl+eyes_+muz
    return dict(headd=head,headw=head,behind=behind,face=face,fill=CF,fillvar='chow-fill')

FPIED=V('frenchie-patch','#3A2C25')
def fren_variant(v):
    # square head, broad flat skull
    left=[(66,346),(64,300),(68,250),(80,204),(104,166),(142,140),(196,128),(256,126)]
    head=smooth(left+[(512-x,y) for x,y in reversed(left[:-1])])
    big={'A':1.0,'B':1.08,'C':0.94}[v]
    def earp(m):
        s=big
        d=f'M84,{200} C62,{150} {52},{70-20*(s-1):.0f} {78},{38-40*(s-1):.0f} C{104},{8-40*(s-1):.0f} {170},{30} {204},{80} C{220},{104} {232},{130} {236},{156} Z'
        di=f'M104,{184} C88,{144} {80},{88-20*(s-1):.0f} {96},{62-36*(s-1):.0f} C{116},{40-36*(s-1):.0f} {164},{58} {190},{96} C{202},{116} {210},{136} {212},{152} Z'
        fill=FPIED if (v=='B' and not m) else FF
        return f'<path d="{mir(d) if m else d}" fill="{fill}" {A()}/><path d="{mir(di) if m else di}" fill="{FE}"/>'
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}">'+earp(0)+earp(1)+'</g></g>'
    def face(k,t,bl):
        y=200; xl,xr=168,344
        patch=f'<path d="M112,166 C134,148 200,154 216,190 C224,218 196,244 162,240 C126,236 102,198 112,166 Z" fill="{FPIED}"/>' if v=='B' else ''
        wr=f'<path d="M232,150 q24,-10 48,0 M226,166 q30,-11 60,0" fill="none" {A(w=6)}/>'
        # flews: two jowly lobes hanging below the short pushed-in nose
        mask=(v=='A' or v=='C')
        mfill=FM if mask else V('frenchie-muzzle','#F4E2C8')
        flews=(f'<path d="M256,214 C236,212 200,216 194,240 C190,262 216,270 236,263 C246,259 252,255 256,250 C260,255 266,259 276,263 C296,270 322,262 318,240 C312,216 276,212 256,214 Z" fill="{mfill}" {A(w=6)}/>'
               f'<path d="M256,236 v14" fill="none" stroke="{"#F4E2C8" if mask else "#120D0B"}" stroke-opacity="0.8" stroke-width="5" stroke-linecap="round"/>')
        nose=(f'<path d="M234,216 C232,206 280,206 278,216 C276,226 266,232 256,232 C246,232 236,226 234,216 Z" fill="#120D0B" stroke="{INK}" stroke-width="3"/>'
              f'<ellipse cx="248" cy="212" rx="7" ry="3" fill="#FFFFFF" fill-opacity="0.6"/><path d="M244,224 q4,3 6,-1 M268,224 q-4,3 -6,-1" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2.5"/>')
        stop=f'<path d="M238,190 q18,7 36,0" fill="none" {A(w=5)}/>'
        ey=dot_eyes(k,r=27,y=y,xs=(xl,xr),hi=9)
        if v=='B' and k=='open': ey=f'<circle cx="{xl}" cy="{y}" r="30.5" fill="none" stroke="{V("frenchie-pied","#FAF5EC")}" stroke-width="4"/>'+ey
        return patch+wr+bl+ey+stop+flews+nose
    fill=FF if v!='B' else V('frenchie-pied','#FAF5EC')
    return dict(headd=head,headw=head,behind=behind,face=face,fill=fill,fillvar='frenchie-fill')
for v in 'ABC':
    BREEDS['chow'+v]=chow_variant(v); BREEDS['fren'+v]=fren_variant(v)
# --- round-2 winners
BREEDS['chowie']=BREEDS['chowC']; BREEDS['frenchie']=BREEDS['frenB']; BREEDS['frenchie-fawn']=BREEDS['frenA']
