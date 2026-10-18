import os,re,io,cairosvg
from PIL import Image,ImageDraw,ImageFont
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'breeds8.py')).read())
OUT=os.environ.get('ART_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sketches')); os.makedirs(OUT+'/frames',exist_ok=True)
TH={'puggie-dark':dict(ink='#161514',bg='#161514',tok={'pug-fill':'#F3E4CA','pug-paw':'#FBF2E3','pug-mask':'#2A211D','pug-desk':'#2E2925','pug-thumb':'#8A5E3C'}),
 'puggie-light':dict(ink='#2A2522',bg='#F7F2EA',tok={'pug-fill':'#F4E5CB','pug-paw':'#FCF4E6','pug-mask':'#2A211D','pug-bean':'#E8838D','pug-blush':'#F2A0A0','pug-desk':'#E8DECD'}),
 'midnight-chow':dict(ink='#131A2C',bg='#131A2C',tok={'pug-fill':'#F3E4CA','pug-paw':'#FBF2E3','pug-mask':'#2A211D','pug-desk':'#25304E','pug-thumb':'#8A5E3C'}),
 'mono':dict(ink='#1C1512',bg='#FFFFFF',tok={'pug-fill':'#FFFFFF','pug-paw':'#FFFFFF','pug-mask':'#1C1512','pug-bean':'#1C1512','pug-key':'#1C1512','pug-blush':'none','pug-desk':'#FFFFFF','pug-thumb':'#1C1512',
   'chow-fill':'#FFFFFF','chow-ear':'#FFFFFF','chow-muzzle':'#FFFFFF','chow-chin':'#FFFFFF','frenchie-fill':'#FFFFFF','frenchie-ear':'#FFFFFF','frenchie-mask':'#1C1512','frenchie-stripe':'#1C1512','tuckie-fill':'#FFFFFF','tuckie-ear':'#FFFFFF','chow-shade':'#FFFFFF','frenchie-patch':'#1C1512','frenchie-pied':'#FFFFFF','frenchie-muzzle':'#FFFFFF','chow-tongue':'#1C1512','chow-mane':'#FFFFFF','chow-faceline':'#8A817A','mark-white':'#FFFFFF','mark-line':'#1C1512','huskie-fill':'#FFFFFF','huskie-ear':'#FFFFFF','corgie-fill':'#FFFFFF','corgie-ear':'#FFFFFF','shibie-fill':'#FFFFFF','shibie-cream':'#FFFFFF','goldie-fill':'#FFFFFF','goldie-ear':'#FFFFFF','goldie-muzzle':'#FFFFFF','huskie-eye':'#1C1512','eye-iris':'#1C1512'})}
CC={}
FR={'idle':'idle','blink':'blink','lhalf':'left-paw-half','rhalf':'right-paw-half','left':'left-paw-down','right':'right-paw-down','both':'both-down','winner':'winner','winner-small':'winner-small'}
def conc(s,tok,ink):
    s=s.replace('var(--pug-key, var(--main, #E8A96B))',tok.get('pug-key','#E8A96B'))
    return re.sub(r'var\(--([a-z-]+), (#[0-9A-Fa-f]+)\)',lambda m:tok.get(m.group(1),m.group(2)),s).replace('currentColor',ink).replace(' color="#1C1512"','')
def png(s,bg):
    im=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=s.encode(),output_width=512,output_height=512))).convert('RGBA')
    b=Image.new('RGBA',im.size,bg); b.alpha_composite(im); return b
FNT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
def sheet(path,cols,rows,cell,get,clab,rlab):
    W=160+len(cols)*cell; H=40+len(rows)*cell; cs=Image.new('RGB',(W,H),'#3a3633'); d=ImageDraw.Draw(cs)
    for i,c in enumerate(cols): d.text((160+i*cell+6,8),clab(c),fill='white',font=FNT)
    for j,r in enumerate(rows):
        d.text((6,40+j*cell+cell//2),rlab(r),fill='white',font=FNT)
        for i,c in enumerate(cols): cs.paste(get(c,r).resize((cell,cell)).convert('RGB'),(160+i*cell,40+j*cell))
    cs.save(path)
DOGS=[(k,False) for k in ['puggie','chowie','frenchie','tuckie']+NEW4+['frenchie-fawn']]
for dk0 in ():
    for f,fn in FR.items():
        for t in TH: CC[(dk0,f,t)]=Image.open(f'{OUT}/frames/{dk0}-{fn}-{t}.png').convert('RGBA')
for br,bd in DOGS:
    dk=br
    for f,fn in FR.items():
        s=render(br,f); open(f'{OUT}/frames/{dk}-{fn}.svg','w').write(s)
        for t,c in TH.items():
            im=png(conc(s,c['tok'],c['ink']),c['bg']); CC[(dk,f,t)]=im; im.save(f'{OUT}/frames/{dk}-{fn}-{t}.png')
    sheet(f'{OUT}/{dk}-frames.png',list(FR),list(TH),200,lambda c,r:CC[(dk,c,r)],lambda c:FR[c][:12],lambda r:r)
EIGHT=['puggie','chowie','frenchie','tuckie']+NEW4
sheet(f'{OUT}/contact-sheet-8.png',EIGHT,list(TH),260,lambda c,r:CC[(c,'idle',r)],str.capitalize,lambda r:r)
def sil(k,f):
    s=render(k,f); a=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=conc(s,TH['puggie-dark']['tok'],'#000').encode()))).split()[3]
    o=Image.new('RGBA',a.size,'white'); o.paste((0,0,0,255),mask=a); return o
sheet(f'{OUT}/silhouette-sheet-8.png',EIGHT,['idle','winner'],260,lambda c,r:sil(c,r),str.capitalize,lambda r:r)
for k in NEW4: sil(k,'idle').save(f'{OUT}/frames/{k}-silhouette.png')
sheet(f'{OUT}/goldie-vs-tuckie.png',['tuckie','goldie'],list(TH),360,lambda c,r:CC[(c,'idle',r)],str.capitalize,lambda r:r)
print('ok')
