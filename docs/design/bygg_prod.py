import cairosvg, math, random, base64, json, os
STAMP="data:image/png;base64,"+base64.b64encode(open('/home/claude/brand/logo-stamp-vit.png','rb').read()).decode()
BRIC="Bricolage Grotesque"; FAM="Familjen Grotesk"; MONO="JetBrains Mono"
ANT="Anton"; SG="Space Grotesk"; JO="Jost"; INK="#0B3D2E"
PW,PH=1240,1754
EX={"namn":"Christer Svensson","antal":"5","plats":"Luanshya, Copperbelt, Zambia",
"koordinater":"-13.131725 · 28.418843","datum":"6 juli 2026","id":"SK-2026-K7M3Q9"}
ORG="SMARTKLIMATKOMPENSERA PÅ TELLUS AB · ORG.NR 559370-9453"
def T(x,y,s,size,fill,font=FAM,anchor="middle",w=None,ls=None,it=False,rot=None,op=None):
    fw=f' font-weight="{w}"' if w else ""; sp=f' letter-spacing="{ls}"' if ls else ""
    st=' font-style="italic"' if it else ""; r=f' transform="rotate({rot} {x} {y})"' if rot else ""
    o=f' opacity="{op}"' if op else ""
    return f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{fw}{sp}{st}{r}{o}>{s}</text>'
def R(x,y,w,h,rx,fill,op=None,rot=None,stroke=None,sw=2):
    o=f' opacity="{op}"' if op else ""; r=f' transform="rotate({rot} {x+w/2} {y+h/2})"' if rot else ""
    st=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{o}{r}{st}/>'
def C(cx,cy,r,fill,op=None,stroke=None,sw=2):
    o=f' opacity="{op}"' if op else ""; st=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{o}{st}/>'
def jit(pts,fill,stroke,sw,seed,close=True,j=4):
    random.seed(seed)
    d="M "+" L ".join(f"{x+random.uniform(-j,j):.0f} {y+random.uniform(-j,j):.0f}" for x,y in pts)+(" Z" if close else "")
    f=f'fill="{fill}"' if fill else 'fill="none"'
    return f'<path d="{d}" {f} stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>'
def stampel(S,x,y,st=88,ring=None):
    S.append(C(x,y,st/2+7,INK,op="0.95"))
    if ring: S.append(C(x,y,st/2+7,"none",stroke=ring,sw=1.6))
    S.append(f'<image href="{STAMP}" x="{x-st/2}" y="{y-st/2}" width="{st}" height="{st}"/>')
def F(k,x,y,size,color,font=FAM,anchor="middle",weight=None,ls=None,italic=False,template="{v}"):
    return {k:{"x":x,"y":y,"size":size,"color":color,"font":font,"anchor":anchor,
    "weight":weight or "normal","letterSpacing":ls or 0,"italic":italic,"template":template}}
def dynT(S,dyn,f,varde):
    if dyn:
        v=f["template"].replace("{v}",varde)
        S.append(T(f["x"],f["y"],v,f["size"],f["color"],f["font"],f["anchor"],
        w=None if f["weight"]=="normal" else f["weight"],ls=str(f["letterSpacing"]) if f["letterSpacing"] else None,it=f["italic"]))
def fot(S,dyn,y,fg,sub,rule,K):
    S.append(f'<line x1="140" y1="{y}" x2="{PW-140}" y2="{y}" stroke="{rule}" stroke-width="2"/>')
    S.append(T(200,y+44,"UTFÄRDAT",11,sub,MONO,"start",ls="2.5"))
    K.update(F("datum",200,y+74,19,fg,FAM,"start","bold"))
    K.update(F("id",PW/2,y+44,13,sub,MONO,"middle","bold",ls=1.5,template="N° {v}"))
    K.update(F("url",PW/2,y+74,14,fg,MONO,template="smartklimat.org/v/{v}"))
    S.append(T(PW-200,y+44,"VERIFIERBART",11,sub,MONO,"end",ls="2.5"))
    S.append(T(PW-200,y+74,"DIGITALT BEVIS",14,fg,MONO,"end",w="bold"))
    S.append(T(PW/2,y+118,ORG,11,sub,MONO,ls="1.5"))
    for k in ("datum","id","url"): dynT(S,dyn,K[k],EX["id" if k in("id","url") else k])
TEMAN={}
def tema(namn):
    def deco(fn): TEMAN[namn]=fn; return fn
    return deco
@tema("fodelsedag")
def _f(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#FFF6E8"))
    S.append(f'<path d="M -50 1430 Q 340 1280 620 1450 T 1290 1400 L 1290 1800 L -50 1800 Z" fill="#19B5A5"/>')
    S.append(f'<path d="M -50 1500 Q 340 1400 620 1520 T 1290 1470 L 1290 1800 L -50 1800 Z" fill="#0B6E63"/>')
    S.append(C(1050,210,120,"#FFC93C")); S.append(f'<path d="M 90 130 L 220 130 L 155 260 Z" fill="#FF4D8D" transform="rotate(12 155 195)"/>')
    random.seed(8)
    for i in range(34):
        x,y=random.uniform(60,1180),random.uniform(80,1330)
        c=random.choice(["#FF4D8D","#FFC93C","#19B5A5","#6C5CE7"])
        if i%3==0: S.append(R(x,y,22,9,4,c,rot=random.uniform(0,360),op="0.85"))
        elif i%3==1: S.append(C(x,y,5,c,op="0.8"))
        else: S.append(f'<path d="M {x} {y} q 9 -12 18 0 q 9 12 18 0" stroke="{c}" stroke-width="4.5" fill="none" stroke-linecap="round"/>')
    S.append(T(PW/2,240,"GRATTIS!",96,INK,BRIC,w="bold",rot=-3))
    S.append(T(PW/2,330,"VÄRDEBEVIS · EN GÅVA SOM VÄXER",22,"#075E52",MONO,ls="6",w="bold"))
    S.append(T(PW/2,470,"DETTA INTYGAR ATT",18,"#6C5CE7",MONO,ls="5",w="bold"))
    K.update(F("namn",PW/2,570,72,INK,BRIC,weight="bold"))
    S.append(R(PW/2-300,606,600,6,3,"#FF4D8D",rot=-1))
    S.append(T(PW/2,690,"HAR LÅTIT PLANTERA",20,INK,MONO,ls="4"))
    K.update(F("antal",PW/2,780,72,"#FF4D8D",BRIC,weight="bold",template="{v} TRÄD"))
    K.update(F("plats",PW/2,880,26,INK,FAM,weight="bold"))
    K.update(F("koordinater",PW/2,920,18,"#075E52",MONO,ls=2))
    S.append(T(PW/2,1030,"\u201dFem träd fyller år med dig — varje år, i hundra år.\u201d",26,INK,FAM,it=True))
    stampel(S,PW/2,1180,92)
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-250,"#FFF6E8","#9FE0D6","#0E8578",K)
@tema("morsdag")
def _m(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#FFF9F4")); S.append('<defs>')
    for i,cc in enumerate(["#F7B2C4","#F49CB2","#E98AA6","#F6CDD8","#DCA8C4"]):
        S.append(f'<radialGradient id="pe{i}"><stop offset="0%" stop-color="{cc}" stop-opacity="0.85"/><stop offset="75%" stop-color="{cc}" stop-opacity="0.45"/><stop offset="100%" stop-color="{cc}" stop-opacity="0"/></radialGradient>')
    S.append('</defs>')
    def blomma(cx,cy,r,seed):
        random.seed(seed); e=""
        for k in range(7):
            a=k*360/7+random.uniform(-8,8)
            px=cx+r*0.55*math.cos(math.radians(a)); py=cy+r*0.55*math.sin(math.radians(a))
            e+=f'<ellipse cx="{px}" cy="{py}" rx="{r*0.62}" ry="{r*0.45}" fill="url(#pe{k%5})" transform="rotate({a} {px} {py})"/>'
        return e+C(cx,cy,r*0.2,"#E8B4C8",op="0.9")+C(cx,cy,r*0.09,"#C77C9B")
    for cx,cy,r,sd in [(170,200,130,1),(1070,170,105,2),(130,1560,100,3),(1090,1590,125,4),(1010,1380,70,5)]:
        S.append(blomma(cx,cy,r,sd))
    S.append(T(PW/2,300,"Till världens mamma",56,"#8A5A6E",JO,ls="2"))
    S.append(T(PW/2,395,"VÄRDEBEVIS",34,"#B8547E",MONO,ls="10",w="bold"))
    S.append(T(PW/2,540,"detta intygar att",30,"#8A5A6E",JO,it=True))
    K.update(F("namn",PW/2,650,76,"#B8547E",BRIC,weight="bold",italic=True))
    S.append(f'<path d="M {PW/2-260} 700 q 260 46 520 0" stroke="#DCA8C4" stroke-width="3" fill="none"/>')
    S.append(T(PW/2,790,"har låtit plantera",30,"#8A5A6E",JO,it=True))
    K.update(F("antal",PW/2,880,84,"#8A5A6E",JO,ls=3,template="{v} träd"))
    K.update(F("plats",PW/2,975,26,"#8A5A6E",JO))
    K.update(F("koordinater",PW/2,1015,17,"#C77C9B",MONO,ls=2))
    S.append(T(PW/2,1130,"\u201dEn skog som växer av kärlek.\u201d",30,"#B8547E",JO,it=True))
    stampel(S,PW/2,1280,88,ring="#DCA8C4")
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-260,"#8A5A6E","#C99EAD","#EAD3DC",K)
@tema("farsdag")
def _fa(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#1E1B16"))
    def hatch(x0,y0,x1,y1,gap,col,sw,seed=1):
        random.seed(seed); e=""
        for i in range(int((y1-y0)/gap)):
            y=y0+i*gap+random.uniform(-2,2)
            e+=f'<path d="M {x0+random.uniform(0,12)} {y} L {x1-random.uniform(0,12)} {y}" stroke="{col}" stroke-width="{sw+random.uniform(-0.5,0.5)}" stroke-linecap="round"/>'
        return e
    S.append(R(0,0,PW,300,0,"#D9822B")); S.append(hatch(0,16,PW,290,15,"#1E1B16",3,3))
    S.append(T(PW/2,190,"FARSDAG",64,"#1E1B16",ANT,ls="20"))
    S.append(T(PW/2,470,"VÄRDEBEVIS",40,"#F2E8D5",ANT,ls="14"))
    S.append(T(PW/2,560,"DETTA INTYGAR ATT",18,"#D9822B",SG,w="bold",ls="5"))
    K.update(F("namn",PW/2,680,84,"#F2E8D5",ANT,ls=2))
    S.append(hatch(320,715,920,740,8,"#D9822B",3,7))
    S.append(T(PW/2,830,"HAR LÅTIT PLANTERA",22,"#F2E8D5",SG,w="bold",ls="4"))
    K.update(F("antal",PW/2,940,90,"#D9822B",ANT,ls=4,template="{v} TRÄD"))
    random.seed(12)
    for i in range(26):
        x=random.uniform(60,1180); y=random.uniform(1020,1180); h=random.uniform(50,120)
        S.append(f'<path d="M {x} {y+h} L {x} {y} M {x-18} {y+h*0.45} L {x} {y+h*0.12} L {x+18} {y+h*0.45} M {x-25} {y+h*0.8} L {x} {y+h*0.4} L {x+25} {y+h*0.8}" stroke="#F2E8D5" stroke-width="4" fill="none" stroke-linecap="round"/>')
    K.update(F("plats",PW/2,1250,20,"#D9822B",SG,weight="bold",ls=1))
    K.update(F("koordinater",PW/2,1285,17,"#8A7A54",MONO,ls=2))
    S.append(T(PW/2,1350,"\u201dStadig som en ek — nu har du fem till.\u201d",26,"#F2E8D5",SG,it=True))
    stampel(S,PW/2,1445,84,ring="#D9822B")
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-250,"#F2E8D5","#8A7A54","#3A332A",K)
@tema("pask")
def _p(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#FFFBEA"))
    S.append(jit([(70,70),(PW-70,70),(PW-70,PH-70),(70,PH-70)],None,"#3A3A3A",6,seed=2,j=6))
    S.append(jit([(92,92),(PW-92,92),(PW-92,PH-92),(92,PH-92)],None,"#B9A0E8",4,seed=3,j=5))
    S.append(T(PW/2,250,"Glad Påsk!",96,"#E8722C",FAM,w="bold",rot=-2))
    S.append(T(PW/2,330,"— VÄRDEBEVIS —",24,"#3A3A3A",MONO,ls="6",w="bold"))
    S.append(T(PW/2,470,"detta intygar att",30,"#3A3A3A",FAM))
    K.update(F("namn",PW/2,580,72,"#3A3A3A",FAM,weight="bold"))
    S.append(jit([(PW/2-280,616),(PW/2+280,624)],None,"#E8722C",6,seed=5,close=False,j=4))
    S.append(T(PW/2,710,"har låtit plantera",30,"#3A3A3A",FAM))
    K.update(F("antal",PW/2,810,80,"#7CB86A",FAM,weight="bold",template="{v} träd"))
    K.update(F("plats",PW/2,900,26,"#3A3A3A",FAM))
    K.update(F("koordinater",PW/2,940,17,"#B9A0E8",MONO,weight="bold",ls=2))
    def agg(cx,cy,rw,rh,base,m,seed):
        e=f'<ellipse cx="{cx}" cy="{cy}" rx="{rw}" ry="{rh}" fill="{base}" stroke="#3A3A3A" stroke-width="4.5"/>'
        random.seed(seed)
        if m=="prick":
            for k in range(7): e+=C(cx+random.uniform(-rw*0.5,rw*0.5),cy+random.uniform(-rh*0.55,rh*0.55),random.uniform(6,10),"#fff",op="0.9")
        if m=="sick":
            for k in range(2):
                y=cy-rh*0.3+k*rh*0.5
                pts=[(cx-rw*0.65+jn*rw*0.22,y+(-9 if jn%2 else 9)) for jn in range(7)]
                e+=jit(pts,None,"#3A3A3A",4,seed=seed+k,close=False,j=1.5)
        if m=="rand":
            for k in range(3): e+=f'<path d="M {cx-rw*0.7} {cy-rh*0.35+k*rh*0.32} q {rw*0.7} 18 {rw*1.4} 0" stroke="#fff" stroke-width="7" fill="none"/>'
        return e
    S.append(agg(400,1130,100,132,"#FFD84D","sick",1))
    S.append(agg(620,1160,88,115,"#9BD98B","prick",2))
    S.append(agg(820,1110,72,95,"#B9A0E8","rand",3))
    S.append(jit([(280,1290),(960,1290)],None,"#3A3A3A",5,seed=9,close=False,j=4))
    S.append(T(PW/2,1360,"\u201dVi gömde inga ägg — vi planterade träd.\u201d",26,"#3A3A3A",FAM,it=True))
    stampel(S,PW/2,1450,80)
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-250,"#3A3A3A","#9C8F6B","#E4D9B0",K)
@tema("jul")
def _j(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#7E1F2B"))
    sx,sy=PW/2,240
    for k in range(8):
        a=k*45
        S.append(f'<path d="M {sx} {sy} L {sx+15} {sy-58} Q {sx} {sy-108} {sx-15} {sy-58} Z" fill="#E9B44C" transform="rotate({a} {sx} {sy})"/>')
    S.append(C(sx,sy,20,"#F6E7C1"))
    S.append(T(PW/2,420,"God Jul",96,"#F6E7C1",BRIC,w="bold"))
    S.append(T(PW/2,490,"VÄRDEBEVIS",26,"#E9B44C",MONO,ls="10",w="bold"))
    py0,py1=560,1240
    d=f'M 120 {py0} '; random.seed(6); x=120
    while x<PW-120:
        w=random.uniform(60,100); d+=f'L {x+w/2} {py0-14} L {x+w} {py0} '; x+=w
    d+=f'L {PW-120} {py1} '; x=PW-120
    while x>120:
        w=random.uniform(60,100); d+=f'L {x-w/2} {py1+14} L {x-w} {py1} '; x-=w
    d+='Z'; S.append(f'<path d="{d}" fill="#F6E7C1"/>')
    S.append(T(PW/2,660,"DETTA INTYGAR ATT",17,"#B04638",MONO,ls="5",w="bold"))
    K.update(F("namn",PW/2,760,70,"#5E1620",BRIC,weight="bold"))
    def kh(cx,cy,s,col): return f'<path d="M {cx} {cy+16*s} C {cx-26*s} {cy-7*s} {cx-14*s} {cy-23*s} {cx} {cy-9*s} C {cx+14*s} {cy-23*s} {cx+26*s} {cy-7*s} {cx} {cy+16*s} Z" fill="{col}"/>'
    S.append(kh(PW/2-330,800,1.1,"#B04638")); S.append(kh(PW/2+330,800,1.1,"#B04638"))
    S.append(f'<line x1="{PW/2-270}" y1="800" x2="{PW/2+270}" y2="800" stroke="#E9B44C" stroke-width="3"/>')
    S.append(T(PW/2,880,"HAR LÅTIT PLANTERA",18,"#7E1F2B",MONO,ls="4",w="bold"))
    K.update(F("antal",PW/2,975,76,"#123326",BRIC,weight="bold",template="{v} TRÄD"))
    K.update(F("plats",PW/2,1060,24,"#5E1620",FAM,weight="bold"))
    K.update(F("koordinater",PW/2,1098,16,"#B04638",MONO,ls=2))
    S.append(T(PW/2,1175,"\u201dÅrets grönaste klapp slår rot i Zambia.\u201d",24,"#5E1620",FAM,it=True))
    for lag,col,yb in [(1,"#123326",1500),(2,"#0D2A1F",1600),(3,"#081F17",1700)]:
        d2=f'M 0 1754 L 0 {yb} '; x=0; random.seed(lag)
        while x<PW:
            w=random.uniform(70,115); hh=random.uniform(80,140)
            d2+=f'L {x+w*0.5} {yb-hh} L {x+w} {yb} '; x+=w
        d2+=f'L {PW} 1754 Z'; S.append(f'<path d="{d2}" fill="{col}"/>')
    stampel(S,PW/2,1360,84,ring="#E9B44C")
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-215,"#F6E7C1","#D9A0A0","#9A3644",K)
@tema("sommar")
def _s(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#F7E7C6"))
    for col,y0,hh in [("#F7E7C6",0,330),("#F2B879",330,190),("#E88A5D",520,140),("#2E7F9E",660,320),("#1E5F7A",980,240),("#173F52",1220,540)]:
        S.append(R(0,y0,PW,hh,0,col))
    S.append(C(PW/2,660,220,"#F6D35E")); S.append(C(PW/2,660,220,"none",stroke="#E88A5D",sw=6))
    S.append(T(PW/2,150,"GLAD SOMMAR",78,"#173F52",ANT,ls="14"))
    S.append(T(PW/2,215,"VÄRDEBEVIS",24,"#B0592F",SG,w="bold",ls="10"))
    S.append(T(PW/2,450,"DETTA INTYGAR ATT",18,"#173F52",SG,w="bold",ls="5"))
    K.update(F("namn",PW/2,640,74,"#173F52",ANT,ls=2))
    K.update(F("antal",PW/2,760,34,"#173F52",SG,weight="bold",ls=2,template="HAR LÅTIT PLANTERA {v} TRÄD"))
    K.update(F("plats",PW/2,1070,26,"#F7E7C6",SG,weight="bold"))
    K.update(F("koordinater",PW/2,1110,18,"#F6D35E",MONO,ls=2))
    S.append(f'<path d="M 470 1215 L 570 1050 L 590 1215 Z" fill="#F7E7C6"/>')
    S.append(f'<path d="M 605 1215 L 685 1095 L 698 1215 Z" fill="#E88A5D"/>')
    S.append(f'<path d="M 430 1215 L 740 1215 Q 712 1268 585 1268 Q 458 1268 430 1215 Z" fill="#0F2E3D"/>')
    for i in range(5):
        S.append(f'<path d="M {70+i*230} {1330+(i%2)*22} q 56 -24 112 0 q 56 24 112 0" stroke="#F7E7C6" stroke-width="7" fill="none" opacity="0.5"/>')
    S.append(T(PW/2,1430,"\u201dNjut av solen — dina träd gör det också.\u201d",26,"#F7E7C6",SG,it=True))
    stampel(S,120,1330,76,ring="#F6D35E")
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-250,"#F7E7C6","#8FB6C7","#2E7F9E",K)
@tema("semester")
def _se(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#F5F0E6"))
    for col,d in [("#1E9E6A",'M 130 250 q 200 -130 320 30 q 95 140 -65 225 q -200 95 -295 -45 q -75 -115 40 -210 Z'),
    ("#E8623D",'M 900 130 q 170 32 138 205 q -28 140 -182 118 q -160 -22 -128 -182 q 26 -118 172 -141 Z'),
    ("#2549C8",'M 110 1300 q 140 -65 225 45 q 95 118 -32 215 q -150 108 -246 -22 q -75 -108 53 -238 Z'),
    ("#F2B33D",'M 940 1330 q 160 -42 205 95 q 42 150 -118 205 q -172 55 -225 -85 q -42 -130 138 -215 Z')]:
        S.append(f'<path d="{d}" fill="{col}"/>')
    def alg2(cx,cy,s,col,rot):
        d=f'M {cx} {cy} '
        for k in range(5): d+=f'q {14*s} {-30*s} 0 {-56*s} q {-14*s} {-26*s} 0 {-52*s} '
        return f'<path d="{d}" stroke="{col}" stroke-width="{10*s}" fill="none" stroke-linecap="round" transform="rotate({rot} {cx} {cy})"/>'
    S.append(alg2(250,900,0.8,"#F2B33D",-12)); S.append(alg2(990,950,0.8,"#E8623D",14))
    S.append(T(PW/2,240,"Ha en skön",52,"#1E1B16",JO,ls="3"))
    S.append(T(PW/2,360,"semester",118,"#2549C8",BRIC,w="bold",it=True,rot=-2))
    S.append(T(PW/2,440,"VÄRDEBEVIS",24,"#1E1B16",MONO,ls="10",w="bold"))
    S.append(T(PW/2,580,"detta intygar att",30,"#1E1B16",JO))
    K.update(F("namn",PW/2,690,72,"#1E1B16",JO,ls=2))
    S.append(f'<line x1="{PW/2-260}" y1="726" x2="{PW/2+260}" y2="726" stroke="#E8623D" stroke-width="4"/>')
    S.append(T(PW/2,820,"har låtit plantera",30,"#1E1B16",JO))
    K.update(F("antal",PW/2,930,84,"#1E9E6A",BRIC,weight="bold",template="{v} TRÄD"))
    K.update(F("plats",PW/2,1030,26,"#1E1B16",JO))
    K.update(F("koordinater",PW/2,1070,17,"#2549C8",MONO,weight="bold",ls=2))
    S.append(T(PW/2,1190,"\u201dKoppla av — skogen jobbar vidare.\u201d",28,"#1E1B16",JO,it=True))
    stampel(S,PW/2,1340,84)
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-250,"#1E1B16","#8C8672","#D9D2BF",K)
@tema("resa")
def _r(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#E9DFC8"))
    random.seed(31)
    for i in range(38):
        y=40+i*46
        S.append(f'<path d="M 0 {y} q 310 {random.uniform(-16,16)} 620 0 t 620 0" stroke="#CBBD9C" stroke-width="1.1" fill="none"/>')
    S.append(f'<path d="M 140 1360 C 420 1150 520 1560 780 1330 S 1080 980 1120 300" stroke="#B33A2B" stroke-width="4.5" fill="none" stroke-dasharray="2 16" stroke-linecap="round"/>')
    S.append(f'<g transform="translate(1120 300) rotate(-62)"><path d="M 0 0 L -46 14 L -34 0 L -46 -14 Z M -8 6 L -30 30 M -8 -6 L -30 -30" fill="#173F52" stroke="#173F52" stroke-width="5"/></g>')
    S.append(C(140,1360,9,"#B33A2B"))
    S.append(T(PW/2,220,"TREVLIG RESA",84,"#173F52",ANT,ls="8"))
    S.append(f'<line x1="230" y1="258" x2="{PW-230}" y2="258" stroke="#173F52" stroke-width="3"/>')
    S.append(T(PW/2,310,"VÄRDEBEVIS — GILTIGT FÖR EN GRÖNARE VÄRLD",22,"#5A4E36",SG,w="bold",ls="2"))
    S.append(T(PW/2,470,"UTFÄRDAT TILL",18,"#8A7A54",MONO,ls="5",w="bold"))
    K.update(F("namn",PW/2,580,72,"#173F52",ANT,ls=2))
    S.append(T(PW/2,700,"DESTINATION",15,"#8A7A54",MONO,ls="4"))
    K.update(F("plats",PW/2,745,30,"#254E3B",SG,weight="bold"))
    K.update(F("koordinater",PW/2,785,18,"#5A4E36",MONO,ls=2))
    def ring(cx,cy,col,under,form="c"):
        e=f'<g opacity="0.88">'
        if form=="c": e+=C(cx,cy,96,"none",stroke=col,sw=6)+C(cx,cy,76,"none",stroke=col,sw=2.4)
        else: e+=R(cx-118,cy-64,236,128,12,"none",stroke=col,sw=6)+R(cx-104,cy-50,208,100,8,"none",stroke=col,sw=2.4)
        e+=T(cx,cy+26,under,14,col,MONO,ls="2")+'</g>'
        return e
    S.append(ring(330,980,"#254E3B","SMARTKLIMAT","r"))
    S.append(ring(880,960,"#B33A2B","AVGÅNG"))
    S.append(ring(620,1180,"#173F52","VERIFIERA ONLINE","r"))
    K.update(F("antal",330,974,25,"#254E3B",MONO,weight="bold",ls=1.5,template="{v} TRÄD OMBORD"))
    K.update(F("datum",880,954,25,"#B33A2B",MONO,weight="bold",ls=1.5))
    K.update(F("id",620,1174,25,"#173F52",MONO,weight="bold",ls=1.5,template="N° {v}"))
    S.append(T(PW/2,1360,"\u201dDitt gröna avtryck reste redan i förväg.\u201d",28,"#5A4E36",SG,it=True))
    stampel(S,140,220,74)
    for k in ("namn","plats","koordinater","antal","datum","id"): dynT(S,dyn,K[k],EX[k])
    S.append(f'<line x1="140" y1="{PH-215}" x2="{PW-140}" y2="{PH-215}" stroke="#CBBD9C" stroke-width="2"/>')
    K.update(F("url",PW/2,PH-165,15,"#173F52",MONO,template="smartklimat.org/v/{v}"))
    dynT(S,dyn,K["url"],EX["id"])
    S.append(T(PW/2,PH-120,ORG,11,"#8A7A54",MONO,ls="1.5"))
@tema("hjartans")
def _h(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#F6F1EA"))
    S.append(R(70,70,PW-140,PH-140,0,"none",stroke="#1E1B16",sw=3))
    def hj(cx,cy,s,col,op): return f'<path d="M {cx} {cy+70*s} C {cx-110*s} {cy-30*s} {cx-60*s} {cy-100*s} {cx} {cy-40*s} C {cx+60*s} {cy-100*s} {cx+110*s} {cy-30*s} {cx} {cy+70*s} Z" fill="{col}" opacity="{op}"/>'
    S.append(hj(500,380,2.6,"#E03131","0.85")); S.append(hj(690,440,2.6,"#F783AC","0.75")); S.append(hj(595,410,0.9,"#1E1B16","1"))
    S.append(T(130,170,"14.02",34,"#1E1B16",MONO,anchor="start",w="bold",ls="4"))
    S.append(T(PW-130,170,"VÄRDEBEVIS",22,"#1E1B16",MONO,anchor="end",ls="6",w="bold"))
    S.append(f'<line x1="70" y1="640" x2="{PW-70}" y2="640" stroke="#1E1B16" stroke-width="3"/>')
    gy=760
    for lbl,key,sz,col in [("MOTTAGARE","namn",44,"#1E1B16"),("HAR PLANTERAT","antal",44,"#E03131"),("PLATS","plats",44,"#1E1B16"),("KOORDINATER","koordinater",30,"#1E1B16")]:
        S.append(T(130,gy,lbl,17,"#8C8672",MONO,anchor="start",ls="3"))
        tmpl="{v} TRÄD" if key=="antal" else "{v}"
        K.update(F(key,130,gy+52,sz,col,JO,"start",ls=1,template=tmpl))
        gy+=140
    S.append(T(130,1400,"Till dig,",64,"#1E1B16",JO,anchor="start"))
    S.append(T(130,1480,"från hjärtat",64,"#E03131",JO,anchor="start",it=True))
    S.append(T(PW-130,1470,"\u201dKärlek som binder —",24,"#1E1B16",MONO,anchor="end"))
    S.append(T(PW-130,1502,"100 kg CO2 om året.\u201d",24,"#1E1B16",MONO,anchor="end"))
    stampel(S,PW-180,760,80)
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-215,"#1E1B16","#8C8672","#1E1B16",K)
@tema("environment")
def _e(S,dyn,K):
    S.append(R(0,0,PW,PH,0,"#F7F5EE"))
    S.append(R(60,60,PW-120,PH-120,0,"none",stroke="#20342A",sw=2))
    S.append(R(74,74,PW-148,PH-148,0,"none",stroke="#20342A",sw=1))
    def blad(cx,cy,L,Bw,rot,col="#20342A"):
        e=f'<g transform="rotate({rot} {cx} {cy})">'
        e+=f'<path d="M {cx} {cy} C {cx-Bw} {cy-L*0.3} {cx-Bw*0.85} {cy-L*0.75} {cx} {cy-L} C {cx+Bw*0.85} {cy-L*0.75} {cx+Bw} {cy-L*0.3} {cx} {cy} Z" fill="none" stroke="{col}" stroke-width="2.4"/>'
        e+=f'<path d="M {cx} {cy} L {cx} {cy-L}" stroke="{col}" stroke-width="1.8"/>'
        for k in range(1,8):
            t=k/8; y=cy-L*t; w=Bw*math.sin(math.pi*min(t*1.15,1))*0.8
            e+=f'<path d="M {cx} {y} Q {cx-w*0.6} {y-9} {cx-w} {y-20} M {cx} {y} Q {cx+w*0.6} {y-9} {cx+w} {y-20}" stroke="{col}" stroke-width="1.2" fill="none"/>'
        return e+'</g>'
    S.append(T(PW/2,180,"WORLD ENVIRONMENT DAY",26,"#20342A",SG,w="bold",ls="8"))
    S.append(f'<line x1="280" y1="212" x2="{PW-280}" y2="212" stroke="#20342A" stroke-width="2"/>')
    S.append(T(PW/2,254,"VÄRDEBEVIS · Fig. 1 — Miombo, planterad i ditt namn",22,"#4E6B58",MONO,it=True))
    S.append(blad(PW/2,1080,580,195,0))
    S.append(blad(330,1210,300,100,-22,"#4E6B58")); S.append(blad(910,1220,320,106,18,"#4E6B58"))
    S.append(f'<line x1="{PW/2}" y1="1080" x2="{PW/2}" y2="1200" stroke="#20342A" stroke-width="3"/>')
    S.append(T(PW/2,380,"UTFÄRDAT TILL",16,"#4E6B58",MONO,ls="4"))
    K.update(F("namn",PW/2,455,58,"#20342A",JO,ls=1))
    K.update(F("antal",PW/2,540,26,"#20342A",SG,weight="bold",ls=2,template="HAR LÅTIT PLANTERA {v} TRÄD"))
    S.append(T(170,1300,"SLÄKTE",16,"#4E6B58",MONO,anchor="start",ls="3"))
    S.append(T(170,1332,"Brachystegia",26,"#20342A",JO,anchor="start",it=True))
    S.append(T(PW-170,1300,"HABITAT",16,"#4E6B58",MONO,anchor="end",ls="3"))
    K.update(F("plats",PW-170,1332,26,"#20342A",JO,"end"))
    S.append(T(PW/2,1408,"KOORDINATER",16,"#4E6B58",MONO,ls="3"))
    K.update(F("koordinater",PW/2,1440,22,"#20342A",MONO))
    S.append(T(PW/2,1510,"\u201dIdag planterar vi framtiden. Bokstavligen.\u201d",28,"#20342A",JO,it=True))
    stampel(S,PW/2,1200,72)
    for k in ("namn","antal","plats","koordinater"): dynT(S,dyn,K[k],EX[k])
    fot(S,dyn,PH-215,"#20342A","#7C8F82","#20342A",K)
karta={}
os.makedirs('prod/public/certs',exist_ok=True); os.makedirs('prod/public/kort',exist_ok=True)
os.makedirs('prod/docs/cert-exempel',exist_ok=True)
from PIL import Image
for namn,fn in TEMAN.items():
    for dyn,ut in [(False,f'bg-{namn}.png'),(True,f'bevis-{namn}.png')]:
        S=[]; K={}
        fn(S,dyn,K)
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PW} {PH}" width="{PW}" height="{PH}">{"".join(S)}</svg>'
        cairosvg.svg2png(bytestring=svg.encode(),write_to=ut,output_width=1550,unsafe=True)
    karta[namn]={"bg":f"/certs/bg-{namn}.jpg","canvas":{"w":PW,"h":PH},"falt":K}
    Image.open(f'bg-{namn}.png').convert('RGB').resize((PW,PH)).save(f'prod/public/certs/bg-{namn}.jpg',quality=88)
    Image.open(f'bevis-{namn}.png').convert('RGB').resize((PW,PH)).save(f'prod/docs/cert-exempel/exempel-{namn}.jpg',quality=85)
    Image.open(f'kort-{namn}.png').convert('RGB').save(f'prod/public/kort/kort-{namn}.jpg',quality=90)
    print(namn,"OK")
json.dump(karta,open('prod/public/certs/faltkartor-teman.json','w'),ensure_ascii=False,indent=1)
from reportlab.pdfgen import canvas as pc
from reportlab.lib.pagesizes import A4
c=pc.Canvas("/mnt/user-data/outputs/vardebevis-tio-teman.pdf",pagesize=A4)
Wp,Hp=A4
for n in TEMAN: c.drawImage(f'bevis-{n}.png',0,0,Wp,Hp); c.showPage()
c.save()
print("PRODUKTIONSPAKET KLART")
