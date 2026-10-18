# PuggieType mascot v8: a short pug pup peeking over the desk, paws reaching up onto a real keyboard.
# Original procedural vector linework by the PuggieType team; nothing traced.
import math, re as _re
SW=13; SW2=6
INK='currentColor'; FILL='var(--pug-fill, #FFFFFF)'; PAW='var(--pug-paw, #F1E2C8)'; KEY='var(--pug-key, var(--main, #E8A96B))'
MASK='var(--pug-mask, #3B2B23)'; DESK='var(--pug-desk, #E6DCCB)'; THUMBC='var(--pug-thumb, #7A5236)'; BEAN='var(--pug-bean, #F09AA2)'; BLUSH='var(--pug-blush, #F4A6A6)'
def A(extra='',w=SW): return f'stroke="{INK}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round" {extra}'
def F(): return f'fill="{FILL}" '+A()
def ty(x): return 296+0.10*(x-256)          # desk back edge, gently angled
FRONT=134                                    # desk depth on screen
CLIP=(f'<clipPath id="pt-above"><path d="M-40,-40 L552,-40 L552,{ty(552):.1f} L-40,{ty(-40):.1f} Z"/></clipPath>'
      f'<clipPath id="pt-reach"><path d="M-40,{ty(-40)-20:.1f} L552,{ty(552)-20:.1f} L552,600 L-40,600 Z"/></clipPath>'
      f'<clipPath id="pt-head"><path d="M-40,-40 L552,-40 L552,{ty(552)-SW/2:.1f} L-40,{ty(-40)-SW/2:.1f} Z"/></clipPath>'
      f'<clipPath id="pt-below"><path d="M-40,{ty(-40):.1f} L552,{ty(552):.1f} L552,600 L-40,600 Z"/></clipPath>')
TABLE=(f'<path d="M4,{ty(4):.1f} L508,{ty(508):.1f}" fill="none" {A()}/>'
       f'<path d="M4,{ty(4)+FRONT:.1f} L508,{ty(508)+FRONT:.1f}" fill="none" {A()}/>')
# --- big round head (wider than tall), only the top peeks over the desk
HEAD=f'<path d="M66,340 C60,176 146,72 256,70 C366,72 452,176 446,340 Z" {F()}/>'
def _ear(m=False):
    d='M150,100 C98,86 54,124 58,184 C60,222 90,238 112,216 C128,200 134,164 172,132 C176,116 166,104 150,100 Z'
    if m: d=_re.sub(r'(-?\d+\.?\d*),(-?\d+\.?\d*)',lambda g:f'{512-float(g.group(1)):g},{g.group(2)}',d)
    return f'<path d="{d}" fill="{MASK}" {A()}/>'
def _fold(m=False):
    d='M146,116 C112,112 84,138 84,178'
    if m: d=_re.sub(r'(-?\d+\.?\d*),(-?\d+\.?\d*)',lambda g:f'{512-float(g.group(1)):g},{g.group(2)}',d)
    return f'<path d="{d}" fill="none" stroke="{FILL}" stroke-opacity="0.28" stroke-width="7" stroke-linecap="round"/>'
EARS=_ear()+_fold()+_ear(True)+_fold(True)
FURDEF=('<radialGradient id="pt-fur" cx="256" cy="150" r="250" gradientUnits="userSpaceOnUse">'
        '<stop offset="0.55" stop-color="var(--pug-mask, #3B2B23)" stop-opacity="0"/><stop offset="1" stop-color="var(--pug-mask, #3B2B23)" stop-opacity="0.22"/></radialGradient>')
FUR='<path d="M66,340 C60,176 146,72 256,70 C366,72 452,176 446,340 Z" fill="url(#pt-fur)" stroke="none"/>'
# --- face: cartoon pug (pale cream-fawn, black folded ears, big black mask rising between the eyes,
#     forehead 'thumbprint', dark eye rims, big sweet slightly droopy glossy eyes, tongue tip, nose fold)
THUMBDEF=('<radialGradient id="pt-thumb" cx="0.5" cy="0.48" r="0.5"><stop offset="0" stop-color="var(--pug-thumb, #7A5236)" stop-opacity="0.85"/>'
          '<stop offset="0.5" stop-color="var(--pug-thumb, #7A5236)" stop-opacity="0.75"/><stop offset="1" stop-color="var(--pug-thumb, #7A5236)" stop-opacity="0"/></radialGradient>')
THUMB='<path d="M256,100 C268,103 280,112 279,123 C278,134 266,141 256,143 C246,141 234,134 233,123 C232,112 244,103 256,100 Z" fill="url(#pt-thumb)" stroke="none"/>'
WRINK=(f'<path d="M206,150 q14,-14 30,-12 M306,150 q-14,-14 -30,-12" fill="none" {A(w=7)}/>')
PATCH=(f'<ellipse cx="186" cy="208" rx="33" ry="31" fill="{MASK}"/><ellipse cx="326" cy="208" rx="33" ry="31" fill="{MASK}"/>')
def eyes(kind):
    if kind=='open':
        s=''
        for x,sg in ((186,-1),(326,1)):
            s+=(f'<circle cx="{x}" cy="210" r="24" fill="#120D0B"/>'
                f'<path d="M{x-25},{200+sg*-3} Q{x},{186} {x+25},{200+sg*3}" fill="none" stroke="{MASK}" stroke-width="7" stroke-linecap="round"/>'
                f'<circle cx="{x-8}" cy="203" r="8.5" fill="#FFFFFF"/><circle cx="{x+9}" cy="219" r="3.6" fill="#FFFFFF"/>')
        return s
    if kind=='closed': return f'<path d="M164,210 q22,14 44,2 M304,212 q22,12 44,-2" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="7" stroke-linecap="round"/>'
    return f'<path d="M164,216 q22,-26 44,-2 M304,214 q22,-24 44,2" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="7" stroke-linecap="round"/>'
BLUSHES=(f'<ellipse cx="122" cy="262" rx="22" ry="11" fill="{BLUSH}" fill-opacity="0.75"/>'
         f'<ellipse cx="390" cy="262" rx="22" ry="11" fill="{BLUSH}" fill-opacity="0.75"/>')
MASKD='M176,306 C170,264 188,242 216,236 C234,232 242,214 256,206 C270,214 278,232 296,236 C324,242 342,264 336,306 C330,336 182,336 176,306 Z'
def muzzle(tongue=True):
    t=(f'<path d="M248,278 h16 q0,17 -8,17 q-8,0 -8,-17 Z" fill="{BEAN}" stroke="#120D0B" stroke-width="3.5" stroke-linejoin="round"/>' if tongue else '')
    return (f'<path d="{MASKD}" fill="{MASK}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
            f'<path d="M230,236 q26,-14 52,0" fill="none" stroke="{FILL}" stroke-opacity="0.55" stroke-width="6" stroke-linecap="round"/>'
            f'<ellipse cx="256" cy="252" rx="17" ry="10.5" fill="#120D0B"/><ellipse cx="250" cy="248" rx="5" ry="2.8" fill="#FFFFFF" fill-opacity="0.7"/>'
            f'<path d="M256,262 v8 M240,274 q8,6 16,-1 q8,7 16,1" fill="none" stroke="{FILL}" stroke-opacity="0.8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'+t)
MUZZLE=muzzle(False)
# --- keyboard lies flat on the desk top (low viewing angle compresses its depth)
U=(1,0.10); _n=math.hypot(*U); U=(U[0]/_n,U[1]/_n); D=(-0.24,0.86)
O=(110,ty(110)+12)
def P(a,b): return (O[0]+U[0]*a+D[0]*b, O[1]+U[1]*a+D[1]*b)
KW,KD,LIP=308,124,12
def rpoly(pts,r):
    n=len(pts); d=''
    for i in range(n):
        p0,p1,p2=pts[i-1],pts[i],pts[(i+1)%n]
        def towards(a,b,t):
            L=math.hypot(b[0]-a[0],b[1]-a[1]); t=min(t,L/2); return (a[0]+(b[0]-a[0])*t/L,a[1]+(b[1]-a[1])*t/L)
        s=towards(p1,p0,r); e=towards(p1,p2,r)
        d+=('M' if i==0 else 'L')+f'{s[0]:.1f},{s[1]:.1f} Q{p1[0]:.1f},{p1[1]:.1f} {e[0]:.1f},{e[1]:.1f} '
    return d+'Z'
ROWS=[[1]*7,[1.35,1,1,1,1,1,0.65],[1.7,1,1,1,1,1.3],[1.25,4.5,1.25]]
PAD,GAP=12,7
def keyrects():
    keys=[]; rh=(KD-2*PAD-3*GAP)/4; aw=(KW-2*PAD)/7
    for r,row in enumerate(ROWS):
        b0=PAD+r*(rh+GAP); a=PAD
        for c,u in enumerate(row):
            keys.append((r,c,a+GAP/2,a+u*aw-GAP/2,b0,b0+rh)); a+=u*aw
    return keys
KEYS=keyrects()
def key(r,c): return next(k for k in KEYS if k[0]==r and k[1]==c)
def keyboard(lit=()):
    q=lambda a0,a1,b0,b1:[P(a0,b0),P(a1,b0),P(a1,b1),P(a0,b1)]
    top=q(0,KW,0,KD)
    front=[P(0,KD),P(KW,KD),(P(KW,KD)[0],P(KW,KD)[1]+LIP),(P(0,KD)[0],P(0,KD)[1]+LIP)]
    side=[P(KW,0),P(KW,KD),(P(KW,KD)[0],P(KW,KD)[1]+LIP),(P(KW,0)[0],P(KW,0)[1]+LIP)]
    sh=[(x+8,y+12) for x,y in [top[0],top[1],side[3],front[2],front[3]]]
    s=f'<path d="{rpoly(sh,18)}" fill="{INK}" fill-opacity="0.16" stroke="none"/>'
    s+=f'<path d="{rpoly([top[0],top[1],side[3],front[2],front[3]],16)}" fill="{FILL}" {A()}/>'
    s+=f'<path d="{rpoly(top,16)}" fill="{FILL}" {A(w=SW2)}/>'
    for (r,c,a0,a1,b0,b1) in KEYS:
        if (r,c) in lit:
            g=q(a0-5,a1+5,b0-5,b1+5); s+=f'<path d="{rpoly(g,9)}" fill="{KEY}" fill-opacity="0.45" stroke="none"/>'
            s+=f'<path d="{rpoly(q(a0,a1,b0,b1),5)}" fill="{KEY}" {A(w=SW2)}/>'
        else:
            s+=f'<path d="{rpoly(q(a0,a1,b0+2.5,b1+2.5),5)}" fill="{INK}" fill-opacity="0.18" stroke="none"/>'
            s+=f'<path d="{rpoly(q(a0,a1,b0,b1),5)}" fill="{PAW}" {A(w=SW2-1.5)}/>'
    return s
def presslines(r,c):
    _,_,a0,a1,b0,b1=key(r,c); s=''
    for a,da,db in [(a0-6,-12,4),(a1+6,12,4)]:
        x0,y0=P(a,(b0+b1)/2); x1,y1=P(a+da,(b0+b1)/2+db)
        s+=f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" fill="none" {A(w=SW2)}/>'
    return s
def pawrest(x,y,rot=17):
    return (f'<g transform="rotate({rot} {x:.1f} {y:.1f})"><ellipse cx="{x:.1f}" cy="{y:.1f}" rx="30" ry="25" fill="{PAW}" {A()}/>'
            f'<ellipse cx="{x-11:.1f}" cy="{y+11:.1f}" rx="4.5" ry="4" fill="{BEAN}"/><ellipse cx="{x:.1f}" cy="{y+14:.1f}" rx="4.5" ry="4" fill="{BEAN}"/><ellipse cx="{x+11:.1f}" cy="{y+11:.1f}" rx="4.5" ry="4" fill="{BEAN}"/></g>')
def pawpress(x,y,rot=17):
    return f'<g transform="rotate({rot} {x:.1f} {y:.1f})"><ellipse cx="{x:.1f}" cy="{y:.1f}" rx="30" ry="19" fill="{PAW}" {A()}/><ellipse cx="{x-11:.1f}" cy="{y+8:.1f}" rx="4.5" ry="3.5" fill="{BEAN}"/><ellipse cx="{x:.1f}" cy="{y+10:.1f}" rx="4.5" ry="3.5" fill="{BEAN}"/><ellipse cx="{x+11:.1f}" cy="{y+8:.1f}" rx="4.5" ry="3.5" fill="{BEAN}"/></g>'
def pawbeans(x,y,rot=0):
    return (f'<g transform="rotate({rot} {x} {y})"><ellipse cx="{x}" cy="{y}" rx="31" ry="33" fill="{PAW}" {A()}/>'
            f'<path d="M{x-12},{y+14} C{x-12},{y+2} {x+12},{y+2} {x+12},{y+14} C{x+12},{y+21} {x-12},{y+21} {x-12},{y+14} Z" fill="{BEAN}"/>'
            f'<ellipse cx="{x-14}" cy="{y-8}" rx="5.5" ry="6.5" fill="{BEAN}"/><ellipse cx="{x}" cy="{y-15}" rx="5.5" ry="6.5" fill="{BEAN}"/><ellipse cx="{x+14}" cy="{y-8}" rx="5.5" ry="6.5" fill="{BEAN}"/></g>')
def _armshape(sh,end,ws,we,extra=''):
    (x1,y1),(x2,y2)=sh,end; L=math.hypot(x2-x1,y2-y1) or 1; ang=math.atan2(y2-y1,x2-x1)
    phi=math.asin(max(-1,min(1,(ws-we)/L)))
    pts=[]
    for sgn in (1,-1):
        t=ang+sgn*(math.pi/2+phi)
        pts.append(((x1+ws*math.cos(t),y1+ws*math.sin(t)),(x2+we*math.cos(t),y2+we*math.sin(t))))
    (a1,a2),(b1,b2)=pts
    poly=f'M{a1[0]:.1f},{a1[1]:.1f} L{a2[0]:.1f},{a2[1]:.1f} L{b2[0]:.1f},{b2[1]:.1f} L{b1[0]:.1f},{b1[1]:.1f} Z'
    return (f'<circle cx="{x1:.1f}" cy="{y1:.1f}" r="{ws}" {extra}/><path d="{poly}" {extra}/><circle cx="{x2:.1f}" cy="{y2:.1f}" r="{we}" {extra}/>')
def arm(sh,end,ws=30,we=21):
    """short tapered chubby forearm: one clean union outline (round shoulder, taper, wrist under the paw)"""
    return ('<g>'+_armshape(sh,end,ws+SW/2,we+SW/2,f'fill="{INK}" stroke="{INK}" stroke-width="{SW/2:g}" stroke-linejoin="round"')
            +_armshape(sh,end,ws-SW/2+0.5,we-SW/2+0.5,f'fill="{PAW}"')+'</g>')

LKEY,RKEY=(1,1),(1,5)
def kp(rc,b_off=0,frac=0.5):
    _,_,a0,a1,b0,b1=key(*rc); return P(a0+(a1-a0)*frac,b0+b_off)
def pawrest(x,y,rot=6):
    return (f'<g transform="rotate({rot} {x:.1f} {y:.1f})"><ellipse cx="{x:.1f}" cy="{y:.1f}" rx="27" ry="21" fill="{PAW}" {A()}/>'
            f'<ellipse cx="{x-10:.1f}" cy="{y+9:.1f}" rx="4" ry="3.5" fill="{BEAN}"/><ellipse cx="{x:.1f}" cy="{y+11:.1f}" rx="4" ry="3.5" fill="{BEAN}"/><ellipse cx="{x+10:.1f}" cy="{y+9:.1f}" rx="4" ry="3.5" fill="{BEAN}"/></g>')
def pawpress(x,y,rot=6):
    return (f'<g transform="rotate({rot} {x:.1f} {y:.1f})"><ellipse cx="{x:.1f}" cy="{y:.1f}" rx="28" ry="17" fill="{PAW}" {A()}/>'
            f'<ellipse cx="{x-10:.1f}" cy="{y+7:.1f}" rx="4" ry="3" fill="{BEAN}"/><ellipse cx="{x:.1f}" cy="{y+9:.1f}" rx="4" ry="3" fill="{BEAN}"/><ellipse cx="{x+10:.1f}" cy="{y+7:.1f}" rx="4" ry="3" fill="{BEAN}"/></g>')
def pawbeans(x,y,rot=0):
    return (f'<g transform="rotate({rot} {x} {y})"><ellipse cx="{x}" cy="{y}" rx="28" ry="30" fill="{PAW}" {A()}/>'
            f'<path d="M{x-11},{y+12} C{x-11},{y+1} {x+11},{y+1} {x+11},{y+12} C{x+11},{y+19} {x-11},{y+19} {x-11},{y+12} Z" fill="{BEAN}"/>'
            f'<ellipse cx="{x-13}" cy="{y-8}" rx="5" ry="6" fill="{BEAN}"/><ellipse cx="{x}" cy="{y-14}" rx="5" ry="6" fill="{BEAN}"/><ellipse cx="{x+13}" cy="{y-8}" rx="5" ry="6" fill="{BEAN}"/></g>')
def presslines(r,c):
    _,_,a0,a1,b0,b1=key(r,c); s=''
    for a,da in [(a0-7,-13),(a1+7,13)]:
        x0,y0=P(a,(b0+b1)/2); x1,y1=P(a+da,(b0+b1)/2+4)
        s+=f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" fill="none" {A(w=SW2)}/>'
    return s
HEADD='M66,340 C60,176 146,72 256,70 C366,72 452,176 446,340 Z'
ARMGEO=[]
def capsule(S,E,ws,erx,ery=None):
    ARMGEO.append((S,E,ws,erx,ery or erx))
    """mitten arm as plain shapes (no style): round shoulder, fat body, rounded/flattened paw end"""
    ery=ery or erx; we=min(erx,ery)
    (x1,y1),(x2,y2)=S,E; L=math.hypot(x2-x1,y2-y1) or 1; ang=math.atan2(y2-y1,x2-x1)
    phi=math.asin(max(-1,min(1,(ws-we)/L))); pts=[]
    for sg in (1,-1):
        t=ang+sg*(math.pi/2+phi); pts.append(((x1+ws*math.cos(t),y1+ws*math.sin(t)),(x2+we*math.cos(t),y2+we*math.sin(t))))
    (a1,a2),(b1,b2)=pts
    return (f'<circle cx="{x1:.1f}" cy="{y1:.1f}" r="{ws}"/>'
            f'<path d="M{a1[0]:.1f},{a1[1]:.1f} L{a2[0]:.1f},{a2[1]:.1f} L{b2[0]:.1f},{b2[1]:.1f} L{b1[0]:.1f},{b1[1]:.1f} Z"/>'
            f'<ellipse cx="{x2:.1f}" cy="{y2:.1f}" rx="{erx}" ry="{ery}"/>')
def raised_col(S,E,ws,we,inner_only=False):
    """raised arm continued down into the body: straight inner side, outer side flares out with one soft curve
    as it meets the torso (sleeve-into-body), reaching below the desk line (clipped there)"""
    (x1,y1),(x2,y2)=S,E; L=math.hypot(x2-x1,y2-y1) or 1; ux,uy=(x2-x1)/L,(y2-y1)/L; nx,ny=-uy,ux
    ext=4.0*ws; wb=ws+(ws-we)*ext/L; bx,by=x1-ux*ext,y1-uy*ext
    o=1 if (x1+nx*10-256)**2>(x1-nx*10-256)**2 else -1           # +n side faces outward?
    Ot=(x1+o*nx*ws,y1+o*ny*ws); It=(x1-o*nx*ws,y1-o*ny*ws)
    Ob=(bx+o*nx*(wb+ws*1.35),by+o*ny*(wb+ws*1.35)); Ib=(bx-o*nx*wb,by-o*ny*wb)
    C=(x1+o*nx*ws-ux*ext*0.75,y1+o*ny*ws-uy*ext*0.75)
    f=lambda q:f'{q[0]:.1f},{q[1]:.1f}'
    Im=(x1-o*nx*ws-ux*ext*0.4,y1-o*ny*ws-uy*ext*0.4)               # inner side: straight, then a soft flare
    Ib2=(Ib[0]-o*nx*ws*0.45,Ib[1]-o*ny*ws*0.45); Ci=(Ib[0]+o*nx*ws*0.05,Ib[1]+o*ny*ws*0.05)   # toward the chest
    if inner_only: return f'M{f(It)} L{f(Im)} Q{f(Ci)} {f(Ib2)}'
    return f'M{f(Ot)} Q{f(C)} {f(Ob)} L{f(Ib2)} Q{f(Ci)} {f(Im)} L{f(It)} Z'
def shoulder_fill(S,E,ws,we):
    """silhouette for a raised arm's upper part (same geometry as the front redraw in arms_front)"""
    return f'<path d="{raised_col(S,E,ws,we)}"/>'
HEADW='M92,338 C48,300 54,172 150,96 C186,76 220,70 256,70 C292,70 326,76 362,96 C458,172 464,300 420,338 Z'
def silhouette(head_tf, arms, uid, headd=None):
    """head + mitten arms as ONE filled shape with ONE continuous outer outline (no seams)"""
    head=f'<g clip-path="url(#pt-head)"><path d="{headd or HEADD}" transform="{head_tf}"/></g>'
    out=(f'<g fill="{INK}" stroke="{INK}" stroke-width="{2*SW}" stroke-linejoin="round">{head}{arms}</g>'
         f'<g fill="{FILL}" stroke="none">{head}{arms}</g>')
    mask=(f'<mask id="pt-am-{uid}" maskUnits="userSpaceOnUse" x="-40" y="-40" width="600" height="600"><rect x="-40" y="-40" width="600" height="600" fill="#fff"/>'
          f'<g fill="#000" stroke="#000" stroke-width="{2*SW}">{arms}</g></mask>')
    return out,mask
def _inarm(x,y):
    for (S,E,ws,erx,ery) in ARMGEO:
        dx,dy=E[0]-S[0],E[1]-S[1]; L2=dx*dx+dy*dy or 1
        t=max(0,min(1,((x-S[0])*dx+(y-S[1])*dy)/L2)); r=ws+(min(erx,ery)-ws)*t
        if math.hypot(x-(S[0]+t*dx),y-(S[1]+t*dy))<=r+SW*0.5: return True
        if ((x-E[0])/(erx+SW*0.5))**2+((y-E[1])/(ery+SW*0.5))**2<=1: return True
    return False
def desk():
    xl,xr=10,502; T=[(xl,ty(xl)),(xr,ty(xr)),(xr,ty(xr)+FRONT),(xl,ty(xl)+FRONT)]
    face=[(xl,ty(xl)+FRONT),(xr,ty(xr)+FRONT),(xr,ty(xr)+FRONT+18),(xl,ty(xl)+FRONT+18)]
    return (f'<path d="{rpoly(face,10)}" fill="{MASK}" fill-opacity="0.22" {A()}/>'
            f'<path d="{rpoly(T,10)}" fill="{DESK}" {A()}/>')
def arms_front(arms,headd=None,head_tf='',above=False):
    """re-draw the mitten arms ON TOP of the face (Bongo-style peek) as ONE continuous outline with the body:
    no shoulder circle/cap - each arm's edges run straight back past the body outline and the redraw is clipped to
    the head interior, so the body outline flows directly into the arm's outer edge (joint kept, no seam/notch)."""
    n=len(ARMGEO); uid=f'af{n}_{int(ARMGEO[0][0][0]*10) if n else 0}_{int(ARMGEO[0][1][1]*10) if n else 0}'
    shp=''; fwd=''; crease=''; ink=''
    for (S,E,ws,erx,ery) in ARMGEO:
        we=min(erx,ery); (x1,y1),(x2,y2)=S,E; L=math.hypot(x2-x1,y2-y1) or 1
        ux,uy=(x2-x1)/L,(y2-y1)/L; nx,ny=-uy,ux
        f=lambda pt:f'{pt[0]:.1f},{pt[1]:.1f}'
        pts=[(x1+nx*ws,y1+ny*ws),(x2+nx*we,y2+ny*we),(x2-nx*we,y2-ny*we),(x1-nx*ws,y1-ny*ws)]
        if uy>0:
            # typing arm: soft "sleeve" - the upper edge bends with one smooth curve down into the body side;
            # stays inside the old round shoulder, so the arm is no bigger than before
            tn=(nx,ny) if ny<0 else (-nx,-ny); sx=-1 if x2>x1 else 1
            T=(x1+tn[0]*ws,y1+tn[1]*ws); B=(x1-tn[0]*ws,y1-tn[1]*ws)
            C1=(T[0]-ux*ws*0.75,T[1]-uy*ws*0.75)
            P2=(x1+sx*ws*1.25,y1+ws*0.55); C2=(P2[0]+0*sx,P2[1]-ws*0.6)
            TE,BE=(pts[1],pts[2]) if tn==(nx,ny) else (pts[2],pts[1])
            sl=f'<path d="M{f(T)} C{f(C1)} {f(C2)} {f(P2)} L{f(B)} L{f(BE)} L{f(TE)} Z"/>'+f'<ellipse cx="{x2:.1f}" cy="{y2:.1f}" rx="{erx}" ry="{ery}"/>'
            shp+=sl; ink+=sl
        else:
            # raised arm: column runs down into the body; the inner edge is an open crease that flares softly
            # toward the chest and ends just above the desk (no box cut, no cap)
            pq=[(pts[0][0]-ux*6,pts[0][1]-uy*6),pts[1],pts[2],(pts[3][0]-ux*6,pts[3][1]-uy*6)]   # overlap: no hairline seam
            shp+=(f'<path d="{raised_col(S,E,ws,we)}"/>'+'<path d="M'+' L'.join(f(q) for q in pq)+' Z"/>'
                  +f'<ellipse cx="{x2:.1f}" cy="{y2:.1f}" rx="{erx}" ry="{ery}"/>')
            ink+=f'<path d="{raised_col(S,E,ws,we,True)}" fill="none"/>'+'<path d="M'+' L'.join(f(q) for q in pts)+' Z"/>'+f'<ellipse cx="{x2:.1f}" cy="{y2:.1f}" rx="{erx}" ry="{ery}"/>'
        m=SW+1; q=[(x1+nx*(ws+m),y1+ny*(ws+m)),(x2+nx*(we+m),y2+ny*(we+m)),(x2-nx*(we+m),y2-ny*(we+m)),(x1-nx*(ws+m),y1-ny*(ws+m))]
        fwd+=('<path d="M'+' L'.join(f(z) for z in q)+' Z"/>'
              f'<ellipse cx="{x2:.1f}" cy="{y2:.1f}" rx="{erx+SW}" ry="{ery+SW}"/>')
    tf=f' transform="{head_tf}"' if head_tf else ''
    hp=f'<path d="{headd or HEADD}"{tf}/>'
    M=lambda i,body:(f'<mask id="{uid}{i}" maskUnits="userSpaceOnUse" x="-40" y="-40" width="600" height="600">'
                     f'<g fill="#fff" stroke="#fff" stroke-linejoin="round">{body}</g></mask>')
    # ink layer: only inside the head (+ the forward arm itself) -> extension edges stop exactly at the body outline
    # fill layer: anywhere the body silhouette is filled (+ half the outline band) -> no clip seam can show
    sh=''.join(f'<circle cx="{S[0]:.1f}" cy="{S[1]:.1f}" r="{ws}"/>' for (S,E,ws,erx,ery) in ARMGEO if E[1]>S[1])
    defs=('<defs>'+M('i',f'<g stroke="none">{hp}{fwd}{sh}</g>')
          +M('f',f'<g stroke="none">{hp}{arms}</g>')+'</defs>')
    outer=' clip-path="url(#pt-head)"' if above else ''
    return (defs+f'<g{outer}><g mask="url(#{uid}i)"><g fill="{INK}" stroke="{INK}" stroke-width="{2*SW}" stroke-linejoin="round">{ink}</g></g>'
            f'<g mask="url(#{uid}f)"><g fill="{FILL}" stroke="none">{shp}</g></g><g mask="url(#{uid}i)">{crease}</g></g>')
def table_split():
    segs=[]; cur=None
    for i in range(10,503):
        x=float(i); inside=_inarm(x,ty(x))
        if not inside and cur is None: cur=x
        if inside and cur is not None: segs.append((cur,x-1)); cur=None
    if cur is not None: segs.append((cur,502))
    d=''.join(f'M{a:.1f},{ty(a):.1f} L{b:.1f},{ty(b):.1f} ' for a,b in segs if b-a>1)
    return f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="butt"/>'
def beans_top(x,y,sc=1.0):
    r=4.6*sc
    return ''.join(f'<ellipse cx="{x+dx*sc:.1f}" cy="{y+dy*sc:.1f}" rx="{r:.1f}" ry="{r*0.85:.1f}" fill="{BEAN}"/>' for dx,dy in [(-12,2),(0,-2),(12,2)])
def inner(d): return f'<path d="{d}" fill="none" {A()}/>'
def raised_inside(x,y,rot=0):
    """Bongo-style raised mitten drawn INSIDE the silhouette: one open arch stroke + beans"""
    return (f'<g transform="rotate({rot} {x} {y})"><path d="M{x-28},{y+44} C{x-30},{y-6} {x-22},{y-30} {x},{y-30} C{x+22},{y-30} {x+30},{y-6} {x+29},{y+30}" fill="none" {A()}/>'
            f'<ellipse cx="{x}" cy="{y+4}" rx="10" ry="8.5" fill="{BEAN}"/>'
            f'<ellipse cx="{x-13}" cy="{y-12}" rx="5" ry="5.5" fill="{BEAN}"/><ellipse cx="{x}" cy="{y-18}" rx="5" ry="5.5" fill="{BEAN}"/><ellipse cx="{x+13}" cy="{y-12}" rx="5" ry="5.5" fill="{BEAN}"/></g>')
# --- breed modules: head shape + face; Puggie is the default
PUG=dict(headd=HEADD,headw=HEADW,behind=lambda tf:'',face=lambda k,t,bl:EARS+WRINK+PATCH+bl+eyes(k)+muzzle(t))
BREED=PUG
LTOP=(104,ty(104)-14); RTOP=(408,ty(408)-14)      # arm roots sit on the head's lower sides: outer edge continues the head line
def frame(name):
    spark=''; lit=[]; uid=name; ARMGEO.clear()
    if name in ('winner','winner-small'):
        tf='translate(25.6,-14) scale(0.9)'
        tf=(tf+' '+BREED.get('xf','')).strip()     # head lifted + slightly smaller so the mittens fit beside the ears
        X=lambda x,y:(25.6+0.9*x,-14+0.9*y)
        arms=capsule(X(66,248),(50,100),26,31)+capsule(X(446,248),(462,100),26,31)
        fil='<g clip-path="url(#pt-head)">'+shoulder_fill(X(66,248),(50,100),26,31)+shoulder_fill(X(446,248),(462,100),26,31)+'</g>'
        out,mask=silhouette(tf,arms+fil,uid,BREED['headw'])
        tongue=f'<path d="M246,284 h20 q0,22 -10,22 q-10,0 -10,-22 Z" fill="{BEAN}" {A(w=6)}/>'
        face=f'<g clip-path="url(#pt-above)"><g transform="{tf}">'+BREED['face']('happy',True,BLUSHES)+'</g></g>'
        mit=(inner('M80,124 C82,146 84,164 86,180')+inner('M432,124 C430,146 428,164 426,180')
             +beans_top(50,88)+f'<ellipse cx="50" cy="108" rx="11" ry="8.5" fill="{BEAN}"/>'
             +beans_top(462,88)+f'<ellipse cx="462" cy="108" rx="11" ry="8.5" fill="{BEAN}"/>')
        bm=f'<mask id="pt-bm-{uid}" maskUnits="userSpaceOnUse" x="-40" y="-40" width="600" height="600"><rect x="-40" y="-40" width="600" height="600" fill="#fff"/><g fill="#000" stroke="#000" stroke-width="{3*SW}">{arms+fil}</g></mask>'
        bh=BREED['behind'](tf); bh=(bm+f'<g mask="url(#pt-bm-{uid})">'+bh+'</g>') if bh else ''   # keep mane/fluff from poking out beside the raised arms
        body=desk()+keyboard()+bh+out+face+arms_front(arms+fil,BREED['headw'],tf,True)+table_split()+mit
        if name=='winner':
            spark=''.join(f'<path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="{FILL}" stroke-width="24" stroke-linecap="round"/><path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>' for x1,y1,x2,y2 in [(204,40,194,20),(256,32,256,10),(308,40,318,20)])
        defs=''
    else:
        L={'left':'down','both':'down','lhalf':'half','right':'up'}.get(name,'rest')
        R={'right':'down','both':'down','rhalf':'half','left':'up'}.get(name,'rest')
        arms=''; extra=''; hide_blush=set()
        for side,st,rc,root in [('L',L,LKEY,LTOP),('R',R,RKEY,RTOP)]:
            if st=='up':
                x=118 if side=='L' else 394
                extra+=raised_inside(x,262,-8 if side=='L' else 8); hide_blush.add(side); continue
            PK=(2,1) if side=='L' else (2,4)
            if st=='down': E=kp(PK,-30); erx,ery=37,20
            elif st=='half': E=kp(PK,-34); E=(E[0],E[1]-18); erx,ery=33,31
            else: E=kp((0,rc[1]),0); erx,ery=33,29
            arms+=capsule(root,E,36,erx,ery)
            # short open inner-edge stroke, stops before reaching the chin
            sx=1 if side=='L' else -1
            ix,iy=E[0]+sx*erx*0.80,E[1]-ery*0.55
            extra+=beans_top(E[0],E[1]+ery*0.25,0.95 if st!='down' else 0.85)
            if st=='down': lit.append(PK); extra=presslines(*PK)+extra
        # keypress head bob: dip ~4px @512 + tiny squash, anchored at the desk line; desk/keyboard/arms stay fixed
        BOB={'left':(1.0,1.016,0.986),'right':(1.0,1.016,0.986),'both':(1.0,1.016,0.986),'lhalf':(0.4,1.006,0.995),'rhalf':(0.4,1.006,0.995)}
        by,bsx,bsy=BOB.get(name,(0,1,1))
        htf=f'translate(0,{by}) translate(256,300) scale({bsx},{bsy}) translate(-256,-300)' if by else ''
        htf=(htf+' '+BREED.get('xf','')).strip()   # per-breed head offset/scale (Puggie: none)
        out,mask=silhouette(htf,arms,uid,BREED['headd'])
        bl=''.join(b for k,b in zip('LR',BLUSHES.split('/>')[:2]) if k not in hide_blush)
        bl=''.join(x+'/>' for x in BLUSHES.split('/>')[:2] if not ((('cx="124"' in x) and 'L' in hide_blush) or (('cx="388"' in x) and 'R' in hide_blush)))
        face=f'<g clip-path="url(#pt-above)"><g transform="{htf}">'+BREED['face']('closed' if name=='blink' else 'open',name=='idle',bl)+'</g></g>'
        body=desk()+keyboard(lit)+BREED['behind'](htf)+out+face+arms_front(arms,BREED['headd'],htf)+table_split()+extra
        defs=''
    halo=body.replace('url(#pt-fur)','none').replace('url(#pt-thumb)','none')
    for c in [PAW,KEY,MASK,BEAN,BLUSH,INK,'#FFFFFF']:
        halo=halo.replace(f'fill="{c}"',f'fill="{FILL}"').replace(f'stroke="{c}"',f'stroke="{FILL}"')
    halo=_re.sub(r'stroke-width="([\d.]+)"',lambda m:f'stroke-width="{float(m.group(1))+16:g}"',halo)
    halo=_re.sub(r'fill-opacity="[\d.]+"','fill-opacity="0"',halo)
    halo=halo.replace(f'mask="url(#pt-am-{uid})"','')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" color="#1C1512"><defs>{CLIP}{FURDEF}{THUMBDEF}{defs}</defs><g transform="translate(20.6,33.0) scale(0.9195)"><g class="halo">{halo}</g>{body}{spark}</g></svg>'

# --- head marks (favicon / lockup) ---
def pmini(tile=None,ink='currentColor',fill='var(--pug-fill, #F0D9B5)',mask='var(--pug-mask, #3B2B23)'):
    lf=fill
    a=f'stroke="{ink}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"'
    r=f'<rect width="64" height="64" rx="14" fill="{tile}"/>' if tile else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">{r}'
      f'<path d="M5,52 C4,30 16,14 32,14 C48,14 60,30 59,52 Z" fill="{fill}" {a}/>'
      f'<path d="M20,20 C13,18 7,23 7,31 C7,36 10,38 13.5,36 C16,34 17,29 22,26 Z M44,20 C51,18 57,23 57,31 C57,36 54,38 50.5,36 C48,34 47,29 42,26 Z" fill="{mask}" {a}/>'
      f'<path d="M26,26 q2,-2 4,-2 M38,26 q-2,-2 -4,-2" fill="none" {a.replace("3.4","2.4")}/>'
      f'<ellipse cx="22.5" cy="32.5" rx="5.4" ry="5.1" fill="{mask}"/><ellipse cx="41.5" cy="32.5" rx="5.4" ry="5.1" fill="{mask}"/>'
      f'<circle cx="22.5" cy="32.5" r="3.9" fill="#120D0B"/><circle cx="41.5" cy="32.5" r="3.9" fill="#120D0B"/>'
      f'<circle cx="21.3" cy="31.2" r="1.35" fill="#FFFFFF"/><circle cx="40.3" cy="31.2" r="1.35" fill="#FFFFFF"/>'
      f'<ellipse cx="14.5" cy="40.5" rx="3.6" ry="2.1" fill="var(--pug-blush, #F4A6A6)"/><ellipse cx="49.5" cy="40.5" rx="3.6" ry="2.1" fill="var(--pug-blush, #F4A6A6)"/>'
      f'<path d="M19.5,47 C18.5,41.5 21.5,38.5 25,38 C27,37 28.5,34.5 32,33.5 C35.5,34.5 37,37 39,38 C42.5,38.5 45.5,41.5 44.5,47 C43.5,50 20.5,50 19.5,47 Z" fill="{mask}" stroke="{ink}" stroke-width="1.6"/><ellipse cx="32" cy="40.5" rx="2.6" ry="1.7" fill="#120D0B"/><path d="M30.6,44 h2.8 q0,2.6 -1.4,2.6 q-1.4,0 -1.4,-2.6 Z" fill="#F09AA2"/><ellipse cx="32" cy="22.5" rx="2.4" ry="3.2" fill="{mask}" fill-opacity="0.85"/></svg>')
def head32(tile='#E8A96B',ink='#161514',fill='#F0D9B5',mask='#3B2B23'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="7" fill="{tile}"/>'
      f'<path d="M3,27 V18 C3,11 9,7 16,7 C23,7 29,11 29,18 V27 Z" fill="{fill}" stroke="{ink}" stroke-width="2" stroke-linejoin="round"/>'
      f'<rect x="2" y="10" width="6" height="8" rx="3" fill="{mask}" stroke="{ink}" stroke-width="1"/><rect x="24" y="10" width="6" height="8" rx="3" fill="{mask}" stroke="{ink}" stroke-width="1"/>'
      f'<rect x="15" y="9" width="2" height="3" rx="1" fill="{mask}"/>'
      f'<rect x="9" y="14" width="3" height="3" rx="1" fill="{ink}"/><rect x="20" y="14" width="3" height="3" rx="1" fill="{ink}"/>'
      f'<rect x="9" y="14" width="1" height="1" fill="#FFFFFF"/><rect x="20" y="14" width="1" height="1" fill="#FFFFFF"/>'
      f'<rect x="5" y="19" width="3" height="2" rx="1" fill="#F2A0A0"/><rect x="24" y="19" width="3" height="2" rx="1" fill="#F2A0A0"/>'
      f'<path d="M9.5,25 C9,21.5 11,19.5 13.5,19 L15,16.5 L17,16.5 L18.5,19 C21,19.5 23,21.5 22.5,25 Z" fill="{mask}"/><rect x="15" y="22" width="2" height="2" rx="1" fill="#F09AA2"/></svg>')
def head48(tile='#E8A96B',ink='#161514',fill='#F0D9B5',mask='#3B2B23'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><rect width="48" height="48" rx="10" fill="{tile}"/>'
      f'<path d="M5,41 V27 C5,16 13,10 24,10 C35,10 43,16 43,27 V41 Z" fill="{fill}" stroke="{ink}" stroke-width="2.5" stroke-linejoin="round"/>'
      f'<path d="M13,14 C8,13 3.5,17 3.5,23 C3.5,27 6,29 8.5,27.5 C10.5,26 11.5,22 14.5,19.5 Z M35,14 C40,13 44.5,17 44.5,23 C44.5,27 42,29 39.5,27.5 C37.5,26 36.5,22 33.5,19.5 Z" fill="{mask}" stroke="{ink}" stroke-width="1.5" stroke-linejoin="round"/>'
      f''
      f'<ellipse cx="18" cy="23" rx="4.4" ry="4.2" fill="{mask}"/><ellipse cx="30" cy="23" rx="4.4" ry="4.2" fill="{mask}"/>'
      f'<rect x="15.5" y="20.5" width="5" height="5" rx="2.5" fill="{ink}"/><rect x="27.5" y="20.5" width="5" height="5" rx="2.5" fill="{ink}"/>'
      f'<circle cx="17.3" cy="22.2" r="1.1" fill="#FFFFFF"/><circle cx="29.3" cy="22.2" r="1.1" fill="#FFFFFF"/>'
      f'<rect x="7.5" y="30" width="4.5" height="2.6" rx="1.3" fill="#F2A0A0"/><rect x="36" y="30" width="4.5" height="2.6" rx="1.3" fill="#F2A0A0"/>'
      f'<path d="M14,38 C13,33 15.5,30 19.5,29.5 C21.5,28.5 22.5,26 24,25 C25.5,26 26.5,28.5 28.5,29.5 C32.5,30 35,33 34,38 Z" fill="{mask}" stroke="{ink}" stroke-width="1"/><ellipse cx="24" cy="31.5" rx="2.4" ry="1.5" fill="#120D0B"/><path d="M22.8,34.2 h2.4 q0,2.4 -1.2,2.4 q-1.2,0 -1.2,-2.4 Z" fill="#F09AA2"/><ellipse cx="24" cy="15.8" rx="1.8" ry="2.4" fill="{mask}"/></svg>')
