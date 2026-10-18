# Tweaks: no side/jowl/face-boundary lines, ears ~25% bigger, one consistent cream (#FBF5E9 = --chow-fill).
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'breeds4.py')).read())
def chow5(left,amps,xf,ear,eyey,xs,ruff=True,eyer=22):
    head=symfur(left,amps)
    ex,ey,es=ear
    def earp(m):
        d=f'M{ex-40*es:.1f},{ey+70*es:.1f} C{ex-36*es:.1f},{ey+30*es:.1f} {ex-14*es:.1f},{ey-14*es:.1f} {ex:.1f},{ey-14*es:.1f} C{ex+14*es:.1f},{ey-14*es:.1f} {ex+40*es:.1f},{ey+30*es:.1f} {ex+50*es:.1f},{ey+70*es:.1f} Z'
        di=f'M{ex-20*es:.1f},{ey+50*es:.1f} C{ex-20*es:.1f},{ey+24*es:.1f} {ex-8*es:.1f},{ey+4*es:.1f} {ex+2*es:.1f},{ey+4*es:.1f} C{ex+14*es:.1f},{ey+6*es:.1f} {ex+22*es:.1f},{ey+26*es:.1f} {ex+24*es:.1f},{ey+50*es:.1f} Z'
        return f'<path d="{mir(d) if m else d}" fill="{CF}" {A()}/><path d="{mir(di) if m else di}" fill="{CE}"/>'
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}">'+earp(0)+earp(1)+'</g></g>'
    xl,xr=xs; y=eyey
    def face(k,t,bl):
        rf=''.join(f'<path d="{d}" fill="none" {A(w=5)}/><path d="{mirq(d)}" fill="none" {A(w=5)}/>' for d in ['M214,286 q8,-8 16,0','M238,282 q9,-8 18,0']) if ruff else ''
        top=''.join(f'<path d="{d}" fill="none" {A(w=5)}/>' for d in ['M246,{0} q4,10 0,20'.format(y-74),'M266,{0} q4,10 -2,20'.format(y-72)])
        sock=''.join(f'<ellipse cx="{x}" cy="{y}" rx="31" ry="26" fill="{SHADE}" fill-opacity="0.45"/>' for x in (xl,xr))
        brow=f'<path d="M{xl-22},{y-28} q22,-4 40,6 M{xr+22},{y-28} q-22,-4 -40,6" fill="none" {A(w=6)}/>'
        if k=='open':
            r=eyer
            eyes_=''.join(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.9:.1f}" fill="#120D0B"/><circle cx="{x-7}" cy="{y-7}" r="7.5" fill="#FFFFFF"/><circle cx="{x+8}" cy="{y+8}" r="3.2" fill="#FFFFFF"/>' for x in (xl,xr))
        else: eyes_=dot_eyes(k,r=20,y=y,xs=(xl,xr))
        my=y+22
        muz=(f'<path d="M228,{my+14} C228,{my+4} 284,{my+4} 284,{my+14} C284,{my+28} 268,{my+36} 256,{my+36} C244,{my+36} 228,{my+28} 228,{my+14} Z" fill="#120D0B"/><ellipse cx="245" cy="{my+11}" rx="8" ry="3.4" fill="#FFFFFF" fill-opacity="0.55"/>'
             f'<path d="M256,{my+36} v8 M228,{my+58} C238,{my+50} 248,{my+50} 256,{my+44} C264,{my+50} 274,{my+50} 284,{my+58}" fill="none" stroke="#120D0B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>')
        tg=f'<path d="M249,{my+54} h14 q0,13 -7,13 q-7,0 -7,-13 Z" fill="{CT}" stroke="#120D0B" stroke-width="3" stroke-linejoin="round"/>' if (t or k=='happy') else ''
        return rf+top+sock+brow+bl+eyes_+muz+tg
    return dict(headd=head,headw=head,behind=behind,face=face,fill=CF,fillvar='chow-fill',xf=xf)
# 4A tweaked (raised round head)
L4=[(96,346),(92,316),(84,286),(76,256),(74,224),(80,190),(94,158),(116,128),(146,102),(182,84),(218,74),(256,70)]
BREEDS['chow4A-final']=chow5(L4,[0,9,11,9,8,7,7,6,5,4,3,2],'translate(0,-4)',(146,80,0.97),168,(198,314))
# 3D tweaked (wide head), now symmetric
L3=[(4,346),(8,318),(16,292),(28,266),(42,240),(60,214),(82,190),(108,166),(140,144),(176,128),(214,118),(256,114)]
BREEDS['chow3D-final']=chow5(L3,[0,15,18,13,17,13,12,8,6,4,3,2],'',(118,128,1.02),186,(186,326),ruff=False,eyer=21)

BREEDS['chowie']=BREEDS['chow4A-final']
# Width study of tweaked 3D (wide, but not as wide)
def chow3w(f):
    L=[(256-(256-x)*f,y) for x,y in L3]
    return chow5(L,[0,15,18,13,17,13,12,8,6,4,3,2],'',(256-138*f,128,1.02),186,(186,326) if f>0.85 else (190,322),ruff=False,eyer=21)
for p in (90,80,70): BREEDS[f'chow3D-{p}']=chow3w(p/100)
BREEDS['chowie']=BREEDS['chow3D-80']
# Chosen: 90% width, lower mane tufts tucked so the outline stays inside the desk edges (symmetric)
def chow90():
    L=[(256-(256-x)*0.9,y) for x,y in L3]
    L[0]=(L[0][0]+16,L[0][1]); L[1]=(L[1][0]+10,L[1][1]); L[2]=(L[2][0]+4,L[2][1])
    return chow5(L,[0,5,10,13,17,13,12,8,6,4,3,2],'',(256-138*0.9,128,1.02),186,(186,326),ruff=False,eyer=21)
BREEDS['chow3D-90t']=chow90(); BREEDS['chowie']=BREEDS['chow3D-90t']
