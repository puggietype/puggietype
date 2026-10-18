# Per-breed head modules for PuggieType character select (rough sketches). Shared body/desk/paws live in pug.py.
import math, re
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'pug.py')).read())
def scallop(cx,cy,rx,ry,a0,a1,n,b):
    """bumpy arc (degrees, SVG coords) from a0 to a1, n bumps pushing out by b"""
    pts=[(cx+rx*math.cos(math.radians(a0+(a1-a0)*i/n)),cy+ry*math.sin(math.radians(a0+(a1-a0)*i/n))) for i in range(n+1)]
    d=f'M{pts[0][0]:.1f},{pts[0][1]:.1f} '
    for i in range(n):
        am=math.radians(a0+(a1-a0)*(i+.5)/n)
        c=(cx+(rx+b)*math.cos(am),cy+(ry+b)*math.sin(am)); d+=f'Q{c[0]:.1f},{c[1]:.1f} {pts[i+1][0]:.1f},{pts[i+1][1]:.1f} '
    return d
def mir(d): return re.sub(r'(-?\d+\.?\d*),(-?\d+\.?\d*)',lambda g:f'{512-float(g.group(1)):g},{g.group(2)}',d)
def mirq(d):
    out=[]
    for seg in re.findall(r'M[^M]+',d):
        n=[0]
        def f(g):
            n[0]+=1; x=float(g.group(1))
            return f'{(512-x) if n[0]==1 else -x:g},{g.group(2)}'
        out.append(re.sub(r'(-?\d+\.?\d*),(-?\d+\.?\d*)',f,seg))
    return ''.join(out)
def V(name,dflt): return f'var(--{name}, {dflt})'
def dot_eyes(kind,r=24,y=210,xs=(186,326),hi=8.5):
    if kind=='closed': return ''.join(f'<path d="M{x-20},{y} q20,13 40,1" fill="none" {A(w=7)}/>' for x in xs)
    if kind=='happy': return ''.join(f'<path d="M{x-20},{y+6} q20,-24 40,0" fill="none" {A(w=7)}/>' for x in xs)
    return ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#120D0B"/><circle cx="{x-r*.33:.1f}" cy="{y-r*.3:.1f}" r="{hi}" fill="#FFFFFF"/><circle cx="{x+r*.38:.1f}" cy="{y+r*.38:.1f}" r="{hi*.42:.1f}" fill="#FFFFFF"/>' for x in xs)
def tongue(t,x=256,y=292,w=9,h=15): return f'<path d="M{x-w},{y} h{2*w} q0,{h} -{w},{h} q-{w},0 -{w},-{h} Z" fill="{BEAN}" stroke="#120D0B" stroke-width="3.5" stroke-linejoin="round"/>' if t else ''

# ---------- CHOWIE: cream chow, lion mane, small rounded ears, small deep-set eyes, broad muzzle ----------
CF=V('chow-fill','#FBF5E9'); CE=V('chow-ear','#EBC9A2'); CM=V('chow-muzzle','#FFFDF8')
def chow_behind(tf):
    ear=lambda m:(lambda d:f'<path d="{mir(d) if m else d}" fill="{CF}" {A()}/>'+f'<path d="{mir("M150,104 C152,78 164,60 180,60 C192,62 196,80 196,96") if m else "M150,104 C152,78 164,60 180,60 C192,62 196,80 196,96"}" fill="none" stroke="none"/>')("M100,124 C98,68 120,32 148,30 C174,32 190,66 194,104 Z")
    inner=lambda m:f'<path d="{mir("M120,108 C120,72 134,50 148,50 C164,52 174,76 176,100 Z") if m else "M120,108 C120,72 134,50 148,50 C164,52 174,76 176,100 Z"}" fill="{CE}"/>'
    mane=scallop(256,262,228,222,176,364,13,22)+'L486,330 L26,330 Z'
    return f'<g clip-path="url(#pt-head)"><g transform="{tf}"><path d="{mane}" fill="{CF}" {A()}/>'+ear(0)+inner(0)+ear(1)+inner(1)+'</g></g>'
def chow_face(k,t,bl):
    fluff=''.join(f'<path d="{d}" fill="none" {A(w=6)}/>' for d in ['M96,250 q14,-6 22,4 q6,-12 22,-8','M416,250 q-14,-6 -22,4 q-6,-12 -22,-8','M232,104 q12,-10 24,0 q12,-10 24,0'])
    brows=f'<path d="M172,180 q18,-8 36,0 M304,180 q18,-8 36,0" fill="none" {A(w=5)}/>'
    cheek=''.join(f'<path d="{mirq(d) if m else d}" fill="none" {A(w=6)}/>' for m in (0,1) for d in ['M84,232 q10,-10 22,-2 q8,-12 22,-4','M96,272 q12,-10 24,-2 q10,-12 24,-2','M120,300 q10,-10 22,-4'])
    muz=(f'<path d="M168,300 C160,252 196,226 256,226 C316,226 352,252 344,300 Z" fill="{CM}" {A(w=6)}/>'
         f'<path d="M206,300 C210,280 232,272 256,272 C280,272 302,280 306,300 Z" fill="{V("chow-chin","#BDB6AE")}" fill-opacity="0.55"/>'
         f'<path d="M196,298 q8,-8 16,0 q8,-8 16,0 M284,298 q8,-8 16,0 q8,-8 16,0" fill="none" {A(w=5)}/>'
         f'<path d="M228,248 C228,232 284,232 284,248 C284,264 266,272 256,272 C246,272 228,264 228,248 Z" fill="#120D0B"/><ellipse cx="245" cy="243" rx="7" ry="4" fill="#FFFFFF" fill-opacity="0.6"/>'
         f'<path d="M256,272 v8 M234,284 q11,7 22,-2 q11,9 22,2" fill="none" stroke="#120D0B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'+tongue(t,256,288,10,13))
    return fluff+cheek+brows+bl+dot_eyes(k,r=20,y=214,xs=(190,322),hi=6.5)+muz
CHOW=dict(headd=HEADD,headw=HEADW,behind=chow_behind,face=chow_face,fill=CF,fillvar='chow-fill')

# ---------- FRENCHIE: fawn French bulldog, huge upright bat ears, flat face, black mask ----------
FF=V('frenchie-fill','#E7C49A'); FE=V('frenchie-ear','#F2A9A9'); FM=V('frenchie-mask','#2A211D')
BRINDLE=False
FHEAD='M78,340 C72,190 150,96 256,94 C362,96 440,190 434,340 Z'
def fren_behind(tf):
    e="M108,196 C76,140 74,62 100,10 C110,-6 128,-6 144,8 C184,46 214,104 222,140 Z"
    ei="M124,170 C102,126 100,66 116,26 C122,16 132,16 140,26 C170,60 192,104 198,136 Z"
    return (f'<g clip-path="url(#pt-head)"><g transform="{tf}">'+''.join(f'<path d="{mir(e) if m else e}" fill="{FF}" {A()}/><path d="{mir(ei) if m else ei}" fill="{FE}"/>' for m in (0,1))+'</g></g>')
def fren_face(k,t,bl):
    wr=f'<path d="M226,136 q30,-12 60,0 M236,154 q20,-8 40,0" fill="none" {A(w=6)}/>'
    mask=(f'<path d="M184,304 C176,262 206,236 256,236 C306,236 336,262 328,304 C322,334 190,334 184,304 Z" fill="{FM}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
          f'<path d="M226,252 C226,238 286,238 286,252 C286,264 268,270 256,270 C244,270 226,264 226,252 Z" fill="#120D0B" stroke="{FF}" stroke-opacity="0.5" stroke-width="3"/><ellipse cx="244" cy="248" rx="6" ry="3.5" fill="#FFFFFF" fill-opacity="0.6"/>'
          f'<path d="M256,270 v8 M226,290 q15,10 30,-2 q15,12 30,2" fill="none" stroke="{FF}" stroke-opacity="0.85" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'+tongue(t,256,292,9,14))
    br=''
    if BRINDLE:
        br=('<clipPath id="fr-clip"><path d="'+FHEAD+'"/></clipPath><g clip-path="url(#fr-clip)">'+''.join(f'<path d="M{x},{y} q-8,30 4,60 q6,20 -2,36" fill="none" stroke="{V("frenchie-stripe","#2A1D16")}" stroke-opacity="0.45" stroke-width="7" stroke-linecap="round"/>' for x,y in [(110,150),(140,126),(166,112),(346,112),(372,126),(402,150),(214,96),(298,96)])+'</g>')
    return br+wr+bl+dot_eyes(k,r=25,y=208,xs=(184,328))+mask
FREN=dict(headd=FHEAD,headw=HEADW,behind=fren_behind,face=fren_face,fill=FF,fillvar='frenchie-fill')

# ---------- TUCKIE: cream/apricot maltipoo, curly outline, floppy fluffy ears, button eyes ----------
TF=V('tuckie-fill','#F7E3C6'); TE=V('tuckie-ear','#E2A873')
THEAD=scallop(256,330,178,240,180,360,11,14).replace('M78.0,330.0','M78,340 L78.0,330.0')+'L434,340 Z'
TOPK=scallop(256,92,62,40,150,390,9,16)+'Z'
def tuck_behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}"><path d="{TOPK}" fill="{TF}" {A()}/></g></g>'
def tuck_face(k,t,bl):
    ear=lambda m:f'<path d="{mir(e) if m else e}" fill="{TE}" {A()}/>'
    global e
    e=scallop(92,236,40,92,-90,270,15,10)+'Z'
    ears=''.join(f'<path d="{mir(e) if m else e}" fill="{TE}" {A()}/>' for m in (0,1))
    top=''.join(f'<path d="M{x-11},{y+4} q0,-14 11,-14 q11,0 11,12 q0,8 -8,8" fill="none" stroke="{TE}" stroke-width="9" stroke-linecap="round"/><path d="M{x-11},{y+4} q0,-14 11,-14 q11,0 11,12 q0,8 -8,8" fill="none" {A(w=4)}/>' for x,y in [(224,96),(256,84),(288,96),(240,120),(274,120)])
    ecurl=''.join(f'<path d="{mirq(d) if m else d}" fill="none" {A(w=4)}/>' for m in (0,1) for d in ['M80,196 q8,-10 16,0 q8,10 16,0','M74,236 q8,-10 16,0 q8,10 16,0','M80,276 q8,-10 16,0 q8,10 16,0'])
    curls=''.join(f'<path d="M{x},{y} q8,-10 16,0" fill="none" {A(w=5)}/>' for x,y in [(200,150),(296,150),(150,120),(346,120)])
    muz=(f'<ellipse cx="256" cy="262" rx="52" ry="38" fill="{PAW}" {A(w=6)}/>'
         f'<ellipse cx="256" cy="246" rx="15" ry="11" fill="#120D0B"/><ellipse cx="251" cy="242" rx="5" ry="3" fill="#FFFFFF" fill-opacity="0.65"/>'
         f'<path d="M256,257 v7 M240,268 q8,7 16,-1 q8,8 16,1" fill="none" stroke="#120D0B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'+tongue(t,256,274,8,12))
    return ears+ecurl+top+curls+bl+dot_eyes(k,r=19,y=204,xs=(196,316),hi=6.5)+muz
TUCK=dict(headd=THEAD,headw=THEAD,behind=tuck_behind,face=tuck_face,fill=TF,fillvar='tuckie-fill')
BREEDS={'puggie':PUG,'chowie':CHOW,'frenchie':FREN,'tuckie':TUCK}
def render(breed,name='idle',brindle=False):
    global BREED,BRINDLE
    BREED=BREEDS[breed]; BRINDLE=brindle; s=frame(name); BREED=PUG; BRINDLE=False
    if breed!='puggie':
        a=s.index('<g class="halo">'); b=s.index(desk(),a)
        s=s[:a]+s[a:b].replace(FILL,BREEDS[breed]['fill'])+s[b:]
    if breed!='puggie': s=s.replace(f'<g fill="{FILL}" stroke="none">',f'<g fill="{BREEDS[breed]["fill"]}" stroke="none">')
    if brindle: s=s.replace('frenchie-fill, #E7C49A','frenchie-fill, #A07A58')
    return s
