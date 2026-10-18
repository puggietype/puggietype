# Round 4: Chowie with breed-specific head pose (raised, round, full ruff collar under the chin).
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'breeds3.py')).read())
def symfur(left,amps,lean=0.5):
    """perfectly symmetric furry outline from left half (bottom-left -> top centre)"""
    segs=[]
    for i in range(len(left)-1):
        (x1,y1),(x2,y2)=left[i],left[i+1]; dx,dy=x2-x1,y2-y1; L=math.hypot(dx,dy) or 1
        nx,ny=dy/L,-dx/L
        if nx>0: nx,ny=-nx,-ny
        segs.append(((x1+dx*lean+nx*amps[i]*1.6,y1+dy*lean+ny*amps[i]*1.6),(x2,y2),amps[i]))
    d=f'M{left[0][0]:.1f},{left[0][1]:.1f} '
    for c,e,a in segs: d+=f'Q{c[0]:.1f},{c[1]:.1f} {e[0]:.1f},{e[1]:.1f} ' if a>=1 else f'L{e[0]:.1f},{e[1]:.1f} '
    pts=[left[0]]+[e for _,e,_ in segs]
    for i in range(len(segs)-1,-1,-1):
        c,_,a=segs[i]; x,y=pts[i]
        d+=f'Q{512-c[0]:.1f},{c[1]:.1f} {512-x:.1f},{y:.1f} ' if a>=1 else f'L{512-x:.1f},{y:.1f} '
    return d+'Z'
FL=V('chow-faceline','#E2CFAF')
def chow4(v):
    if v=='A':   # round head, ruff collar flares to the paws
        left=[(96,346),(92,316),(84,286),(76,256),(74,224),(80,190),(94,158),(116,128),(146,102),(182,84),(218,74),(256,70)]
        amps=[0,9,11,9,8,7,7,6,5,4,3,2]; faceb=258; eyey=168; xf='translate(0,-4)'
    elif v=='B': # bigger ruff, slightly smaller face
        left=[(80,346),(74,316),(68,286),(66,256),(70,222),(78,188),(94,156),(118,126),(148,100),(184,82),(220,72),(256,68)]
        amps=[0,12,14,12,10,8,7,6,5,4,3,2]; faceb=250; eyey=164; xf='translate(0,-6)'
    else:        # taller round head scaled up a touch (pipeline per-breed scale)
        left=[(98,346),(94,316),(86,286),(78,256),(76,224),(82,190),(96,158),(118,128),(148,102),(184,84),(220,74),(256,70)]
        amps=[0,10,12,10,8,7,7,6,5,4,3,2]; faceb=254; eyey=166; xf='translate(256,300) scale(1.04) translate(-256,-306)'
    head=symfur(left,amps)
    ex,ey,es=148,80,0.78
    def earp(m):
        d=f'M{ex-40*es:.1f},{ey+70*es:.1f} C{ex-36*es:.1f},{ey+30*es:.1f} {ex-14*es:.1f},{ey-14*es:.1f} {ex:.1f},{ey-14*es:.1f} C{ex+14*es:.1f},{ey-14*es:.1f} {ex+40*es:.1f},{ey+30*es:.1f} {ex+50*es:.1f},{ey+70*es:.1f} Z'
        di=f'M{ex-20*es:.1f},{ey+50*es:.1f} C{ex-20*es:.1f},{ey+24*es:.1f} {ex-8*es:.1f},{ey+4*es:.1f} {ex+2*es:.1f},{ey+4*es:.1f} C{ex+14*es:.1f},{ey+6*es:.1f} {ex+22*es:.1f},{ey+26*es:.1f} {ex+24*es:.1f},{ey+50*es:.1f} Z'
        return f'<path d="{mir(d) if m else d}" fill="{CMANE}" {A()}/><path d="{mir(di) if m else di}" fill="{CE}"/>'
    def behind(tf): return f'<g clip-path="url(#pt-head)"><g transform="{tf}">'+earp(0)+earp(1)+'</g></g>'
    # whiter face disc, symmetric soft fur edge, ending at the chin so the cream ruff shows below it
    disc=symfur([(200,faceb),(150,faceb-12),(122,faceb-44),(112,faceb-84),(118,faceb-124),(140,faceb-158),(176,faceb-180),(216,faceb-190),(256,faceb-192)],[0,5,6,6,6,5,5,4,3],lean=0.55)
    xl,xr,y=198,314,eyey
    def face(k,t,bl):
        # ruff collar tufts between chin and paws (symmetric)
        ruff=''.join(f'<path d="{d}" fill="none" {A(w=5)}/><path d="{mirq(d)}" fill="none" {A(w=5)}/>' for d in ['M206,280 q4,12 -4,22','M232,272 q4,12 -2,24','M180,272 q2,10 -6,18'])
        mane=''.join(f'<path d="{d}" fill="none" {A(w=5)}/><path d="{mirq(d)}" fill="none" {A(w=5)}/>' for d in ['M96,200 q-8,16 2,32','M108,150 q-8,10 -6,24','M92,262 q-6,12 2,24'])
        fd=f'<path d="{disc}" fill="{CF}" stroke="{FL}" stroke-width="4" stroke-linejoin="round"/>' if v!='C' or True else ''
        sock=''.join(f'<ellipse cx="{x}" cy="{y}" rx="31" ry="26" fill="{SHADE}" fill-opacity="0.55"/>' for x in (xl,xr))
        brow=f'<path d="M{xl-22},{y-28} q22,-4 40,6 M{xr+22},{y-28} q-22,-4 -40,6" fill="none" {A(w=6)}/>'
        if k=='open':
            r=22
            eyes_=''.join(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.9:.1f}" fill="#120D0B"/><circle cx="{x-7}" cy="{y-7}" r="7.5" fill="#FFFFFF"/><circle cx="{x+8}" cy="{y+8}" r="3.2" fill="#FFFFFF"/>' for x in (xl,xr))
        else: eyes_=dot_eyes(k,r=20,y=y,xs=(xl,xr))
        w=56; my=y+22
        muz=(f'<path d="M{256-w},{my+58} C{256-w-4},{my+26} {256-w+8},{my+6} {256-w+28},{my+4} L{256+w-28},{my+4} C{256+w-8},{my+6} {256+w+4},{my+26} {256+w},{my+58} C{256+w-18},{my+72} {256-w+18},{my+72} {256-w},{my+58} Z" fill="#FFFFFF" fill-opacity="0.55"/>'
             f'<path d="M{256-w+4},{my+16} C{256-w-4},{my+36} {256-w+4},{my+60} {256-22},{my+62} M{256+w-4},{my+16} C{256+w+4},{my+36} {256+w-4},{my+60} {256+22},{my+62}" fill="none" {A(w=6)}/>'
             f'<path d="M228,{my+14} C228,{my+4} 284,{my+4} 284,{my+14} C284,{my+28} 268,{my+36} 256,{my+36} C244,{my+36} 228,{my+28} 228,{my+14} Z" fill="#120D0B"/><ellipse cx="245" cy="{my+11}" rx="8" ry="3.4" fill="#FFFFFF" fill-opacity="0.55"/>'
             f'<path d="M256,{my+36} v8 M228,{my+58} C238,{my+50} 248,{my+50} 256,{my+44} C264,{my+50} 274,{my+50} 284,{my+58}" fill="none" stroke="#120D0B" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>')
        tg=f'<path d="M249,{my+54} h14 q0,13 -7,13 q-7,0 -7,-13 Z" fill="{CT}" stroke="#120D0B" stroke-width="3" stroke-linejoin="round"/>' if (t or k=='happy') else ''
        return mane+ruff+fd+sock+brow+bl+eyes_+muz+tg
    return dict(headd=head,headw=head,behind=behind,face=face,fill=CMANE,fillvar='chow-mane',xf=xf)
for v in 'ABC': BREEDS['chow4'+v]=chow4(v)
def _tilt(b0):
    def beh(tf):
        s=b0(tf)
        if 'scale(0.9)' not in tf: return s
        head=f'<g clip-path="url(#pt-head)"><g transform="{tf}">'; body=s[len(head):-len('</g></g>')]
        el=[e+'/>' for e in body.split('/>') if e]
        return head+f'<g transform="rotate(-14 160 180)">{el[0]}{el[1]}</g><g transform="rotate(14 352 180)">{el[2]}{el[3]}</g></g></g>'
    return beh
FAWN=dict(BREEDS['frenA']); FAWN['behind']=_tilt(BREEDS['frenA']['behind']); BREEDS['frenchie-fawn']=FAWN
BREEDS['chowie']=BREEDS['chow4A']
