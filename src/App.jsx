import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = "https://ypmfwkibmbcpquxxpglp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwbWZ3a2libWJjcHF1eHhwZ2xwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDYzNzksImV4cCI6MjA4ODYyMjM3OX0._scbSGuaXlr2WWIAcGRGhmTSkD5ym1O-0lTB8xe3vko";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EJS_SERVICE  = "service_b444tkh";
const EJS_TPL_RESA = "template_dswzd08";
const EJS_TPL_ANNUL= "template_yuhd9ks";
const EJS_PUBKEY   = "f4atCcjmZiZdCiS3H";

async function sendEmail(templateId, params) {
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: EJS_SERVICE, template_id: templateId, user_id: EJS_PUBKEY, template_params: params })
    });
    const txt = await res.text();
    console.log("EmailJS →", res.status, txt, params);
  } catch(e) { console.warn("Email non envoyé", e); }
}

const VILLAGE="Allondaz",DESTINATIONS=["Annecy","Albertville","Ugine","Chambéry"],KNOWN_PLACES=["Place de l'Église, Allondaz","Mairie d'Allondaz","Arrêt de bus Allondaz","Salle des fêtes, Allondaz","École d'Allondaz"],DAYS_FR=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"],DAYS_SHORT=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],MONTHS_FR=["Janv.","Févr.","Mars","Avr.","Mai","Juin","Juil.","Août","Sept.","Oct.","Nov.","Déc."],MONTHS_LONG=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],TODAY=new Date().toISOString().split("T")[0],PALETTE=[["#E8F4FD","#1A5276"],["#E9F7EF","#1E8449"],["#FEF9E7","#9A7D0A"],["#FDEDEC","#922B21"],["#F5EEF8","#6C3483"],["#EBF5FB","#154360"]];
function fmtDate(d){if(!d)return"";const dt=new Date(d+"T00:00:00");return`${dt.getDate()} ${MONTHS_FR[dt.getMonth()]} ${dt.getFullYear()}`;}
function fmtTime(t){return t?t.slice(0,5):"";}
function initials(n){return(n||"?").split(" ").filter(Boolean).map(w=>w[0]).join("").toUpperCase().slice(0,2);}
function getOccurrences(trip){const type=trip.recurrence_type;if(!type||type==="none")return[trip.trip_date];const out=[],max=new Date();max.setDate(max.getDate()+365);// Commencer depuis aujourd'hui (ou trip_date si dans le futur)
let cur=new Date(Math.max(new Date(trip.trip_date+"T00:00:00"),new Date(TODAY+"T00:00:00")));// Reculer au bon jour de départ pour weekly/weekly_days
if(type==="weekly"){const tripStart=new Date(trip.trip_date+"T00:00:00");while(cur<tripStart)cur.setDate(cur.getDate()+7);}
if(type==="weekly_days"&&trip.recurrence_days?.length>0){while(!trip.recurrence_days.includes(cur.getDay())&&cur<=max)cur.setDate(cur.getDate()+1);}
while(cur<=max&&out.length<365){const iso=cur.toISOString().split("T")[0];out.push(iso);if(type==="daily")cur.setDate(cur.getDate()+1);else if(type==="weekly_days"){do{cur.setDate(cur.getDate()+1);}while(!trip.recurrence_days?.includes(cur.getDay())&&cur<=max);}else if(type==="weekly")cur.setDate(cur.getDate()+7);else if(type==="monthly")cur.setMonth(cur.getMonth()+1);else break;}return out;}

const CSS=`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Playfair+Display:wght@600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#F2F5EE;}button{cursor:pointer;font-family:inherit;}input,select,textarea{font-family:inherit;outline:none;}textarea{resize:vertical;}.lift{transition:transform .2s,box-shadow .2s;}.lift:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(0,0,0,.13)!important;}.fade{animation:fadeUp .3s ease both;}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes toastIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}@keyframes spin{to{transform:rotate(360deg)}}input:focus,select:focus,textarea:focus{border-color:#4A7C59!important;box-shadow:0 0 0 3px rgba(74,124,89,.2)!important;}.cal-day:hover{background:#EAF4E0!important;}`;

export default function App(){
  const[session,setSession]=useState(null);const[profile,setProfile]=useState(null);const[ready,setReady]=useState(false);const[authView,setAuthView]=useState("login");const[notif,setNotif]=useState(null);
  const toast=useCallback((msg,type="ok")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3500);},[]);
  useEffect(()=>{sb.auth.getSession().then(({data:{session:s}})=>{setSession(s);setReady(true);});const{data:{subscription}}=sb.auth.onAuthStateChange((_,s)=>setSession(s));return()=>subscription.unsubscribe();},[]);
  useEffect(()=>{if(!session?.user?.id){setProfile(null);return;}sb.from("profiles").select("*").eq("id",session.user.id).single().then(({data})=>{if(data)setProfile(data);});},[session?.user?.id]);
  if(!ready)return<Spinner full/>;
  return(
    <div style={{fontFamily:"'Nunito',sans-serif",minHeight:"100vh",background:"#F2F5EE",color:"#2A2A1E"}}>
      <style>{CSS}</style>
      {notif&&<Toast notif={notif}/>}
      {!session?<AuthScreen view={authView} setView={setAuthView} toast={toast} onProfileCreated={setProfile}/>:<MainApp session={session} profile={profile} setProfile={setProfile} toast={toast}/>}
    </div>
  );
}

function AuthScreen({view,setView,toast,onProfileCreated}){
  const[email,setEmail]=useState("");const[password,setPassword]=useState("");const[fullName,setFullName]=useState("");const[phone,setPhone]=useState("");const[avatarFile,setAvatarFile]=useState(null);const[avatarPreview,setAvatarPreview]=useState(null);const[loading,setLoading]=useState(false);const[err,setErr]=useState("");const fileRef=useRef();
  const pickAvatar=e=>{const f=e.target.files?.[0];if(!f)return;setAvatarFile(f);const r=new FileReader();r.onload=ev=>setAvatarPreview(ev.target.result);r.readAsDataURL(f);};
  const handleLogin=async()=>{if(!email||!password){setErr("Remplissez tous les champs.");return;}setLoading(true);setErr("");const{error}=await sb.auth.signInWithPassword({email,password});setLoading(false);if(error){setErr("Email ou mot de passe incorrect.");return;}toast("Bienvenue ! 👋");};
  const handleRegister=async()=>{if(!email||!password||!fullName){setErr("Prénom/nom, email et mot de passe sont requis.");return;}if(password.length<6){setErr("Mot de passe : 6 caractères minimum.");return;}setLoading(true);setErr("");const{data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo:"https://covoit-allondaz.vercel.app"}});if(error){setLoading(false);setErr("Erreur : "+error.message);return;}const uid=data?.user?.id;if(!uid){setLoading(false);setErr("Erreur d'inscription. Réessayez.");return;}let avatar_url=null;if(avatarFile){const path=`${uid}/avatar`;await sb.storage.from("avatars").upload(path,avatarFile,{upsert:true});const{data:{publicUrl}}=sb.storage.from("avatars").getPublicUrl(path);avatar_url=publicUrl;}await sb.from("profiles").upsert([{id:uid,full_name:fullName,phone,avatar_url,email}]);onProfileCreated({id:uid,full_name:fullName,phone,avatar_url,email});setLoading(false);toast("Compte créé ! Vérifiez votre email 📧");setView("login");};
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,background:"linear-gradient(160deg,#F2F5EE 0%,#E0EBD5 100%)"}}>
      <div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:54,marginBottom:8}}>🏔️</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:700,color:"#2E5339"}}>Covoit' {VILLAGE}</div><div style={{fontSize:13,color:"#6A8A60",marginTop:6,fontWeight:700}}>Annecy · Albertville · Ugine · Chambéry</div><div style={{marginTop:8,fontSize:13,color:"#9AAA8A",fontWeight:600}}>Trajets gratuits entre voisins 🌻</div></div>
      <div style={{background:"#fff",borderRadius:22,padding:28,width:"100%",maxWidth:420,boxShadow:"0 8px 40px rgba(0,0,0,.12)",border:"1px solid #E2E8D8"}}>
        <div style={{display:"flex",background:"#F2F5EE",borderRadius:12,padding:4,marginBottom:22}}>{[["login","Se connecter"],["register","S'inscrire"]].map(([v,l])=><button key={v} onClick={()=>{setView(v);setErr("");}} style={{flex:1,padding:"9px",borderRadius:9,border:"none",fontWeight:800,fontSize:13,background:view===v?"#fff":"transparent",color:view===v?"#2E5339":"#888",boxShadow:view===v?"0 2px 8px rgba(0,0,0,.08)":"none",transition:"all .2s"}}>{l}</button>)}</div>
        {err&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 14px",color:"#DC2626",fontSize:13,fontWeight:700,marginBottom:16}}>⚠ {err}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {view==="register"&&(<><div style={{display:"flex",alignItems:"center",gap:16}}><div onClick={()=>fileRef.current.click()} style={{width:72,height:72,borderRadius:18,background:avatarPreview?"transparent":"#EAF4E0",overflow:"hidden",cursor:"pointer",flexShrink:0,border:"2px dashed #B8D4A0",display:"flex",alignItems:"center",justifyContent:"center"}}>{avatarPreview?<img src={avatarPreview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:28}}>📷</span>}</div><div><div style={{fontWeight:800,fontSize:14,color:"#2E5339"}}>Photo de profil</div><div style={{fontSize:12,color:"#888",marginTop:2}}>Les voisins vous reconnaîtront</div><button onClick={()=>fileRef.current.click()} style={{marginTop:6,background:"none",border:"1px solid #C8D5BE",borderRadius:7,padding:"4px 12px",fontSize:12,fontWeight:700,color:"#4A7C59"}}>{avatarPreview?"Changer":"Choisir une photo"}</button><input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} style={{display:"none"}}/></div></div><FldA label="Prénom et nom *"><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Marie Dupont" style={IA()}/></FldA><FldA label="Téléphone"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="06 12 34 56 78" style={IA()}/></FldA></>)}
          <FldA label="Email *"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.fr" style={IA()}/></FldA>
          <FldA label="Mot de passe *"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={view==="register"?"6 caractères minimum":"••••••••"} style={IA()}/></FldA>
        </div>
        <button onClick={view==="login"?handleLogin:handleRegister} disabled={loading} style={{width:"100%",marginTop:20,background:loading?"#9AB89A":"linear-gradient(135deg,#2E5339,#4A7C59)",color:"#fff",border:"none",borderRadius:13,padding:"14px",fontWeight:900,fontSize:16,boxShadow:"0 6px 20px rgba(46,83,57,.3)"}}>{loading?"⏳ Chargement…":view==="login"?"Se connecter →":"Créer mon compte 🌿"}</button>
        <div style={{textAlign:"center",marginTop:14,fontSize:12,color:"#888"}}>{view==="login"?"Pas encore de compte ? ":"Déjà inscrit ? "}<button onClick={()=>{setView(view==="login"?"register":"login");setErr("");}} style={{background:"none",border:"none",color:"#4A7C59",fontWeight:800,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>{view==="login"?"S'inscrire gratuitement":"Se connecter"}</button></div>
      </div>
    </div>
  );
}

function MainApp({session,profile,setProfile,toast}){
  const[tab,setTab]=useState("calendar");
  const[trips,setTrips]=useState([]);
  const[profilesMap,setProfilesMap]=useState({});
  const[loading,setLoading]=useState(true);
  const[bookings,setBookings]=useState([]);
  const[myTripBookings,setMyTripBookings]=useState([]);

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const{data:tripData}=await sb.from("trips").select("*").gte("trip_date",TODAY).order("trip_date",{ascending:true});
    const list=tripData||[];setTrips(list);
    const uids=[...new Set(list.map(t=>t.user_id))];const map={};
    for(const uid of uids){const{data:pd}=await sb.from("profiles").select("*").eq("id",uid).single();if(pd)map[uid]=pd;}
    setProfilesMap(map);
    const{data:bData}=await sb.from("bookings").select("*").eq("passenger_id",session.user.id);
    setBookings(bData||[]);
    const myIds=list.filter(t=>t.user_id===session.user.id).map(t=>t.id);
    if(myIds.length>0){const{data:mbData}=await sb.from("bookings").select("*, profiles(full_name,phone,avatar_url,id,email)").in("trip_id",myIds);setMyTripBookings(mbData||[]);}
    else setMyTripBookings([]);
    setLoading(false);
  },[session.user.id]);

  useEffect(()=>{loadAll();},[loadAll]);

  const flatTrips=useMemo(()=>{const out=[];trips.forEach(t=>getOccurrences(t).forEach(d=>out.push({...t,occDate:d})));return out.sort((a,b)=>a.occDate.localeCompare(b.occDate)||a.trip_time.localeCompare(b.trip_time));},[trips]);

  const handleBook=async(trip,occDate)=>{
    const already=bookings.find(b=>b.trip_id===trip.id&&b.trip_date===occDate);
    if(already){toast("Vous avez déjà réservé ce trajet.","warn");return;}
    const{error}=await sb.from("bookings").insert([{trip_id:trip.id,passenger_id:session.user.id,trip_date:occDate,status:"pending"}]);
    if(error){toast("Erreur lors de la réservation.","err");return;}
    // Email au conducteur
    const driver=profilesMap[trip.user_id];
    // Récupérer l'email depuis profiles (colonne email)
    const{data:driverProfile}=await sb.from("profiles").select("email").eq("id",trip.user_id).single();
    const driverEmail=driverProfile?.email||"";
    await sendEmail(EJS_TPL_RESA,{
      conducteur_nom: driver?.full_name||"Conducteur",
      conducteur_email: driverEmail,
      passager_nom: profile?.full_name||"Un voisin",
      date: fmtDate(occDate),
      heure: fmtTime(trip.trip_time),
      depart: trip.from_place,
      destination: trip.to_city+" — "+trip.to_address,
      to_email: driverEmail
    });
    toast("Demande envoyée ! Le conducteur va confirmer 🙏");
    loadAll();
  };

  const handleDelete=async(trip)=>{
    // Récupérer les passagers avec réservation acceptée pour les prévenir
    const tripBookings=myTripBookings.filter(b=>b.trip_id===trip.id&&b.status==="accepted");
    await sb.from("trips").delete().eq("id",trip.id);
    setTrips(p=>p.filter(t=>t.id!==trip.id));
    // Email aux passagers
    for(const b of tripBookings){
      if(b.profiles?.email){
        await sendEmail(EJS_TPL_ANNUL,{
          passager_nom: b.profiles?.full_name||"Passager",
          passager_email: b.profiles?.email,
          message: `Le trajet du ${fmtDate(trip.trip_date)} à ${fmtTime(trip.trip_time)} vers ${trip.to_city} a été annulé par le conducteur.`,
          to_email: b.profiles?.email
        });
      }
    }
    toast("Trajet supprimé.","warn");
    loadAll();
  };

  const handleBookingAction=async(bookingId,status)=>{
    await sb.from("bookings").update({status}).eq("id",bookingId);
    // Email au passager si refus
    if(status==="refused"){
      const booking=myTripBookings.find(b=>b.id===bookingId);
      if(booking){
        const trip=trips.find(t=>t.id===booking.trip_id);
        const{data:passengerProfile}=await sb.from("profiles").select("email,full_name").eq("id",booking.passenger_id).single();
        if(passengerProfile?.email){
          await sendEmail(EJS_TPL_ANNUL,{
            passager_nom: passengerProfile.full_name||"Passager",
            passager_email: passengerProfile.email,
            message: `Votre demande de réservation du ${fmtDate(booking.trip_date)} à ${fmtTime(trip?.trip_time)} vers ${trip?.to_city} n'a pas été acceptée par le conducteur.`,
            to_email: passengerProfile.email
          });
        }
      }
    }
    toast(status==="accepted"?"Réservation acceptée ✅":"Réservation refusée.");
    loadAll();
  };

  const myTrips=trips.filter(t=>t.user_id===session.user.id);
  const pendingCount=myTripBookings.filter(b=>b.status==="pending").length;

  return(
    <div>
      <header style={{background:"linear-gradient(135deg,#2E5339 0%,#4A7C59 100%)",color:"#fff",boxShadow:"0 4px 20px rgba(46,83,57,.4)"}}>
        <div style={{maxWidth:760,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{fontSize:28}}>🏔️</div><div><div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,lineHeight:1.1}}>Covoit' {VILLAGE}</div><div style={{fontSize:11,color:"#B8D4A0",fontWeight:600}}>Annecy · Albertville · Ugine · Chambéry</div></div></div>
            <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar profile={profile} size={36}/><button onClick={()=>sb.auth.signOut()} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"6px 12px",color:"#fff",fontSize:12,fontWeight:700}}>Déconnexion</button></div>
          </div>
          <div style={{display:"flex",gap:1,background:"rgba(0,0,0,.15)",borderRadius:"10px 10px 0 0",overflow:"hidden"}}>
            {[["calendar","📅 Calendrier"],["publish","➕ Proposer"],["mine","📋 Mes trajets"+(pendingCount>0?` (${pendingCount})`:"")],["mybookings","🎫 Mes résa"],["account","👤 Profil"]].map(([key,label])=>(
              <button key={key} onClick={()=>setTab(key)} style={{flex:1,background:tab===key?"rgba(255,255,255,.18)":"transparent",border:"none",color:tab===key?"#fff":"rgba(255,255,255,.55)",fontWeight:tab===key?800:600,fontSize:11,padding:"10px 2px",borderBottom:tab===key?"3px solid #A8D070":"3px solid transparent",transition:"all .2s"}}>{label}</button>
            ))}
          </div>
        </div>
      </header>
      <main style={{maxWidth:760,margin:"0 auto",padding:"20px 16px 60px"}}>
        {tab==="calendar"&&<CalendarTab flatTrips={flatTrips} trips={trips} profilesMap={profilesMap} session={session} bookings={bookings} myTripBookings={myTripBookings} onBook={handleBook} loading={loading}/>}
        {tab==="publish"&&<PublishForm session={session} toast={toast} onPublished={t=>{setTrips(p=>[t,...p]);setTab("mine");}}/>}
        {tab==="mine"&&<MineTab myTrips={myTrips} myTripBookings={myTripBookings} profile={profile} onDelete={handleDelete} onBookingAction={handleBookingAction} onPublish={()=>setTab("publish")}/>}
        {tab==="mybookings"&&<MyBookingsTab bookings={bookings} trips={trips} profilesMap={profilesMap}/>}
        {tab==="account"&&<AccountTab session={session} profile={profile} setProfile={setProfile} toast={toast}/>}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDRIER
// ═══════════════════════════════════════════════════════════════════════════════
function CalendarTab({flatTrips,trips,profilesMap,session,bookings,myTripBookings,onBook,loading}){
  const now=new Date();
  const[calYear,setCalYear]=useState(now.getFullYear());
  const[calMonth,setCalMonth]=useState(now.getMonth());
  const[selectedDate,setSelectedDate]=useState(null);

  const tripsByDate=useMemo(()=>{
    const m={};
    flatTrips.forEach(t=>{if(!m[t.occDate])m[t.occDate]=[];m[t.occDate].push(t);});
    return m;
  },[flatTrips]);

  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const prevMonth=()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);setSelectedDate(null);};
  const nextMonth=()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);setSelectedDate(null);};

  const selectedTrips=selectedDate?tripsByDate[selectedDate]||[]:[];

  return(
    <div className="fade">
      {/* Calendrier */}
      <div style={{background:"#fff",borderRadius:18,padding:20,boxShadow:"0 2px 16px rgba(0,0,0,.07)",border:"1px solid #E2E8D8",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <button onClick={prevMonth} style={{background:"#F2F5EE",border:"none",borderRadius:9,width:36,height:36,fontSize:18,color:"#2E5339",fontWeight:900}}>‹</button>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:"#2E5339"}}>{MONTHS_LONG[calMonth]} {calYear}</div>
          <button onClick={nextMonth} style={{background:"#F2F5EE",border:"none",borderRadius:9,width:36,height:36,fontSize:18,color:"#2E5339",fontWeight:900}}>›</button>
        </div>
        {/* Jours de la semaine */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
          {["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:900,color:"#9AAA8A",padding:"4px 0"}}>{d}</div>)}
        </div>
        {/* Cases du calendrier */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
          {Array(firstDay).fill(null).map((_,i)=><div key={"e"+i}/>)}
          {Array(daysInMonth).fill(null).map((_,i)=>{
            const day=i+1;
            const iso=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dayTrips=tripsByDate[iso]||[];
            const isToday=iso===TODAY;
            const isSelected=iso===selectedDate;
            const isPast=iso<TODAY;
            return(
              <div key={day} className="cal-day" onClick={()=>dayTrips.length>0?setSelectedDate(iso===selectedDate?null:iso):null} style={{borderRadius:10,padding:"6px 2px",textAlign:"center",cursor:dayTrips.length>0?"pointer":"default",background:isSelected?"#2E5339":isToday?"#EAF4E0":"#FAFCF7",border:isSelected?"2px solid #2E5339":isToday?"2px solid #A8D070":"2px solid transparent",opacity:isPast?.5:1,transition:"all .15s"}}>
                <div style={{fontSize:13,fontWeight:isToday||isSelected?900:600,color:isSelected?"#fff":isToday?"#2E5339":"#444",marginBottom:3}}>{day}</div>
                {dayTrips.length>0&&(
                  <div style={{display:"flex",justifyContent:"center",gap:2,flexWrap:"wrap"}}>
                    {dayTrips.slice(0,3).map((_,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:isSelected?"#A8D070":"#4A7C59"}}/>)}
                    {dayTrips.length>3&&<div style={{width:6,height:6,borderRadius:"50%",background:isSelected?"#A8D070":"#9AB89A"}}/>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Légende */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12,fontSize:11,color:"#888",fontWeight:600}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:"#4A7C59"}}/> Trajet disponible</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:14,height:14,borderRadius:4,background:"#EAF4E0",border:"2px solid #A8D070"}}/> Aujourd'hui</div>
        </div>
      </div>

      {/* Liste trajets du jour sélectionné */}
      {selectedDate&&(
        <div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#2E5339",marginBottom:14}}>
            Trajets du {fmtDate(selectedDate)}
            <span style={{fontSize:13,fontWeight:600,color:"#888",marginLeft:10}}>{selectedTrips.length} trajet{selectedTrips.length!==1?"s":""}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {selectedTrips.map((t,i)=>{
              const isMine=t.user_id===session.user.id;
              const myBooking=bookings.find(b=>b.trip_id===t.id&&b.trip_date===t.occDate);
              const acceptedCount=myTripBookings.filter(b=>b.trip_id===t.id&&b.trip_date===t.occDate&&b.status==="accepted").length;
              const seatsLeft=Math.max(0,t.seats-acceptedCount);
              return<TripCard key={`${t.id}-${t.occDate}`} trip={t} i={i} driver={profilesMap[t.user_id]} isMine={isMine} seatsLeft={seatsLeft} myBooking={myBooking} onBook={()=>onBook(t,t.occDate)}/>;
            })}
          </div>
        </div>
      )}

      {/* Liste complète si rien de sélectionné */}
      {!selectedDate&&(
        <div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#2E5339",marginBottom:14}}>
            Tous les trajets à venir
            <span style={{fontSize:13,fontWeight:600,color:"#888",marginLeft:10}}>{flatTrips.length} trajet{flatTrips.length!==1?"s":""}</span>
          </div>
          {loading?<Spinner inline/>:flatTrips.length===0?<Empty label="Aucun trajet à venir" sub="Soyez le premier à proposer !"/>:
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {flatTrips.slice(0,15).map((t,i)=>{
                const isMine=t.user_id===session.user.id;
                const myBooking=bookings.find(b=>b.trip_id===t.id&&b.trip_date===t.occDate);
                const acceptedCount=myTripBookings.filter(b=>b.trip_id===t.id&&b.trip_date===t.occDate&&b.status==="accepted").length;
                const seatsLeft=Math.max(0,t.seats-acceptedCount);
                return<TripCard key={`${t.id}-${t.occDate}`} trip={t} i={i} driver={profilesMap[t.user_id]} isMine={isMine} seatsLeft={seatsLeft} myBooking={myBooking} onBook={()=>onBook(t,t.occDate)}/>;
              })}
            </div>
          }
        </div>
      )}
    </div>
  );
}

function MineTab({myTrips,myTripBookings,profile,onDelete,onBookingAction,onPublish}){
  return(
    <div className="fade">
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#2E5339",marginBottom:14}}>Mes trajets</div>
      {myTrips.length===0?<Empty label="Aucun trajet publié" sub={<button onClick={onPublish} style={{background:"none",border:"none",color:"#4A7C59",fontWeight:800,fontSize:13,cursor:"pointer",textDecoration:"underline"}}>Proposer un trajet</button>}/>:
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {myTrips.map((t,i)=>{
            const tripBookings=myTripBookings.filter(b=>b.trip_id===t.id);
            const pending=tripBookings.filter(b=>b.status==="pending");
            const accepted=tripBookings.filter(b=>b.status==="accepted");
            return(
              <div key={t.id} style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8D8",overflow:"hidden",boxShadow:"0 2px 14px rgba(0,0,0,.07)"}}>
                <TripCard trip={{...t,occDate:t.trip_date}} i={i} driver={profile} isMine seatsLeft={t.seats-accepted.length}/>
                {pending.length>0&&(
                  <div style={{padding:"12px 18px",background:"#FEF9E7",borderTop:"1px solid #FDE68A"}}>
                    <div style={{fontSize:11,fontWeight:900,color:"#92400E",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>⏳ {pending.length} demande{pending.length>1?"s":""} en attente</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {pending.map(b=>(
                        <div key={b.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:10,padding:"10px 14px",border:"1px solid #FDE68A"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <Avatar profile={b.profiles} size={36}/>
                            <div><div style={{fontWeight:800,fontSize:13}}>{b.profiles?.full_name||"…"}</div><div style={{fontSize:11,color:"#888"}}>{b.profiles?.phone||"Pas de téléphone"} · {fmtDate(b.trip_date)}</div></div>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>onBookingAction(b.id,"accepted")} style={{background:"#2E5339",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontWeight:800,fontSize:12}}>✓ Accepter</button>
                            <button onClick={()=>onBookingAction(b.id,"refused")} style={{background:"none",border:"1.5px solid #FECACA",color:"#DC2626",borderRadius:8,padding:"6px 12px",fontWeight:800,fontSize:12}}>✕ Refuser</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {accepted.length>0&&(
                  <div style={{padding:"12px 18px",background:"#F0FDF4",borderTop:"1px solid #BBF7D0"}}>
                    <div style={{fontSize:11,fontWeight:900,color:"#166534",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>✅ {accepted.length} passager{accepted.length>1?"s":""} confirmé{accepted.length>1?"s":""}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {accepted.map(b=>(
                        <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,background:"#fff",borderRadius:8,padding:"6px 10px",border:"1px solid #BBF7D0"}}>
                          <Avatar profile={b.profiles} size={28}/>
                          <div><div style={{fontWeight:800,fontSize:12}}>{b.profiles?.full_name}</div>{b.profiles?.phone&&<a href={`tel:${b.profiles.phone.replace(/\s/g,"")}`} style={{fontSize:11,color:"#4A7C59",textDecoration:"none",fontWeight:700}}>{b.profiles.phone}</a>}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{padding:"0 18px 16px",paddingTop:12}}><button onClick={()=>onDelete(t)} style={{width:"100%",background:"none",border:"1.5px solid #FECACA",color:"#DC2626",borderRadius:10,padding:"9px",fontWeight:800,fontSize:13}}>Supprimer ce trajet</button></div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

function MyBookingsTab({bookings,trips,profilesMap}){
  return(
    <div className="fade">
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#2E5339",marginBottom:14}}>Mes réservations</div>
      {bookings.length===0?<Empty label="Aucune réservation" sub="Réservez un trajet depuis le calendrier"/>:
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {bookings.map(b=>{
            const trip=trips.find(t=>t.id===b.trip_id);
            const driver=trip?profilesMap[trip.user_id]:null;
            const statusStyle={pending:["#FEF9E7","#92400E","⏳ En attente"],accepted:["#F0FDF4","#166534","✅ Confirmé"],refused:["#FEF2F2","#DC2626","✕ Refusé"]}[b.status]||["#F2F5EE","#666","?"];
            return(
              <div key={b.id} style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #E2E8D8",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div><div style={{fontWeight:800,fontSize:15,color:"#2E5339"}}>{trip?.to_city||"…"} — {trip?.to_address||""}</div><div style={{fontSize:13,color:"#666",marginTop:2}}>📅 {fmtDate(b.trip_date)} à {fmtTime(trip?.trip_time)}</div><div style={{fontSize:12,color:"#888",marginTop:1}}>📍 {trip?.from_place}</div></div>
                  <span style={{background:statusStyle[0],color:statusStyle[1],borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:800,whiteSpace:"nowrap"}}>{statusStyle[2]}</span>
                </div>
                {driver&&<div style={{display:"flex",alignItems:"center",gap:10,background:"#F8FAF5",borderRadius:10,padding:"10px 12px"}}><Avatar profile={driver} size={36}/><div><div style={{fontWeight:800,fontSize:13}}>{driver.full_name}</div>{b.status==="accepted"&&driver.phone&&<a href={`tel:${driver.phone.replace(/\s/g,"")}`} style={{fontSize:12,color:"#4A7C59",textDecoration:"none",fontWeight:700}}>📞 {driver.phone}</a>}</div></div>}
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

function PublishForm({session,toast,onPublished}){
  const empty=()=>({fromPlaceMode:"known",fromPlace:KNOWN_PLACES[0],fromAddress:"",toCityMode:"fixed",toCity:DESTINATIONS[0],toCustomCity:"",toAddress:"",date:"",time:"",hasReturn:false,returnTime:"",seats:"3",note:"",recurrence:{type:"none",days:[]}});
  const[form,setForm]=useState(empty());const[errs,setErrs]=useState({});const[loading,setLoading]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));const fr=(k,v)=>setForm(p=>({...p,recurrence:{...p.recurrence,[k]:v}}));
  const toggleDay=d=>fr("days",form.recurrence.days.includes(d)?form.recurrence.days.filter(x=>x!==d):[...form.recurrence.days,d].sort());
  const finalCity=form.toCityMode==="fixed"?form.toCity:form.toCustomCity;
  const validate=()=>{const e={};if(!form.date)e.date="Requis";if(!form.time)e.time="Requis";const dep=form.fromPlaceMode==="known"?form.fromPlace:form.fromAddress;if(!dep.trim())e.from="Requis";if(!form.toAddress.trim())e.toAddress="Requis";if(form.toCityMode==="custom"&&!form.toCustomCity.trim())e.toCustomCity="Requis";if(form.hasReturn&&!form.returnTime)e.returnTime="Requis";if(form.recurrence.type==="weekly_days"&&form.recurrence.days.length===0)e.days="Choisissez au moins un jour";return e;};
  const handleSubmit=async()=>{const e=validate();setErrs(e);if(Object.keys(e).length>0)return;setLoading(true);const row={user_id:session.user.id,from_place:form.fromPlaceMode==="known"?form.fromPlace:form.fromAddress,to_city:finalCity,to_address:form.toAddress,trip_date:form.date,trip_time:form.time,has_return:form.hasReturn,return_time:form.hasReturn?form.returnTime:null,seats:parseInt(form.seats),note:form.note,recurrence_type:form.recurrence.type,recurrence_days:form.recurrence.type==="weekly_days"?form.recurrence.days:null};const{data,error}=await sb.from("trips").insert([row]).select();setLoading(false);if(error||!data?.[0]){toast("Erreur lors de la publication.","err");return;}toast("Trajet publié ! Merci 🌻");setForm(empty());setErrs({});onPublished(data[0]);};
  const recOpts=[["none","🔂 Unique","Sans répétition"],["daily","📅 Tous les jours","Chaque jour"],["weekly_days","📆 Jours choisis","Lun, mer…"],["weekly","🗓 Chaque semaine","Même jour"],["monthly","🗃 Chaque mois","Même date"]];
  return(
    <div className="fade"><div style={{background:"#fff",borderRadius:18,padding:24,boxShadow:"0 2px 16px rgba(0,0,0,.07)",border:"1px solid #E2E8D8"}}>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:21,fontWeight:700,color:"#2E5339",marginBottom:3}}>Proposer un trajet</div>
      <div style={{fontSize:13,color:"#8A9A7A",marginBottom:22}}>100 % gratuit 🌿</div>
      <Sec title="Point de départ">
        <div style={{display:"flex",gap:8,marginBottom:10}}>{[["known","📍 Lieu connu"],["custom","✏️ Adresse libre"]].map(([v,l])=><button key={v} onClick={()=>f("fromPlaceMode",v)} style={{flex:1,padding:"9px",borderRadius:9,fontWeight:700,fontSize:13,background:form.fromPlaceMode===v?"#2E5339":"#F2F5EE",color:form.fromPlaceMode===v?"#fff":"#666",border:`1.5px solid ${form.fromPlaceMode===v?"#2E5339":"#DDE4D0"}`}}>{l}</button>)}</div>
        <Fld err={errs.from}>{form.fromPlaceMode==="known"?<select value={form.fromPlace} onChange={e=>f("fromPlace",e.target.value)} style={IS()}>{KNOWN_PLACES.map(p=><option key={p} value={p}>{p}</option>)}</select>:<input value={form.fromAddress} onChange={e=>f("fromAddress",e.target.value)} placeholder="Adresse à Allondaz" style={IS(errs.from)}/>}</Fld>
      </Sec>
      <Sec title="Destination">
        <div style={{display:"flex",gap:8,marginBottom:10}}>{[["fixed","🏙️ Ville connue"],["custom","✏️ Autre ville"]].map(([v,l])=><button key={v} onClick={()=>f("toCityMode",v)} style={{flex:1,padding:"9px",borderRadius:9,fontWeight:700,fontSize:13,background:form.toCityMode===v?"#2E5339":"#F2F5EE",color:form.toCityMode===v?"#fff":"#666",border:`1.5px solid ${form.toCityMode===v?"#2E5339":"#DDE4D0"}`}}>{l}</button>)}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {form.toCityMode==="fixed"
            ?<Fld label="Ville *"><select value={form.toCity} onChange={e=>f("toCity",e.target.value)} style={IS()}>{DESTINATIONS.map(c=><option key={c} value={c}>{c}</option>)}</select></Fld>
            :<Fld label="Ville *" err={errs.toCustomCity}><input value={form.toCustomCity} onChange={e=>f("toCustomCity",e.target.value)} placeholder="Ex: Moûtiers, Bourg-Saint-Maurice…" style={IS(errs.toCustomCity)}/></Fld>
          }
          <Fld label="Adresse précise *" err={errs.toAddress}><input value={form.toAddress} onChange={e=>f("toAddress",e.target.value)} placeholder="Gare, marché, hôpital…" style={IS(errs.toAddress)}/></Fld>
        </div>
      </Sec>
      <Sec title="Date et horaires">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Fld label="Date *" err={errs.date}><input type="date" min={TODAY} value={form.date} onChange={e=>f("date",e.target.value)} style={IS(errs.date)}/></Fld><Fld label="Heure *" err={errs.time}><input type="time" value={form.time} onChange={e=>f("time",e.target.value)} style={IS(errs.time)}/></Fld></div>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}><input type="checkbox" checked={form.hasReturn} onChange={e=>f("hasReturn",e.target.checked)} style={{width:18,height:18,accentColor:"#2E5339"}}/><span style={{fontSize:14,fontWeight:700,color:"#444"}}>Je propose aussi le retour</span></label>
        {form.hasReturn&&<Fld label="Heure de retour *" err={errs.returnTime}><input type="time" value={form.returnTime} onChange={e=>f("returnTime",e.target.value)} style={{...IS(errs.returnTime),maxWidth:200}}/></Fld>}
      </Sec>
      <Sec title="Récurrence">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{recOpts.map(([v,title,sub])=><button key={v} onClick={()=>fr("type",v)} style={{textAlign:"left",padding:"10px 12px",borderRadius:10,background:form.recurrence.type===v?"#EAF4E0":"#F2F5EE",border:`1.5px solid ${form.recurrence.type===v?"#4A7C59":"#DDE4D0"}`,transition:"all .15s"}}><div style={{fontWeight:800,fontSize:13,color:form.recurrence.type===v?"#2E5339":"#444"}}>{title}</div><div style={{fontSize:11,color:"#888",marginTop:2}}>{sub}</div></button>)}</div>
        {form.recurrence.type==="weekly_days"&&<div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:800,color:"#666",marginBottom:8}}>Jours actifs *</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{DAYS_SHORT.map((d,i)=><button key={i} onClick={()=>toggleDay(i)} style={{width:44,height:44,borderRadius:10,fontWeight:800,fontSize:13,border:"1.5px solid",background:form.recurrence.days.includes(i)?"#2E5339":"#F2F5EE",color:form.recurrence.days.includes(i)?"#fff":"#666",borderColor:form.recurrence.days.includes(i)?"#2E5339":"#DDE4D0"}}>{d}</button>)}</div></div>}
      </Sec>
      <Sec title="Infos"><div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12}}><Fld label="Places"><select value={form.seats} onChange={e=>f("seats",e.target.value)} style={IS()}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} place{n>1?"s":""}</option>)}</select></Fld><Fld label="Message"><textarea value={form.note} onChange={e=>f("note",e.target.value)} placeholder="Infos utiles…" rows={2} style={IS()}/></Fld></div></Sec>
      <button onClick={handleSubmit} disabled={loading} style={{width:"100%",background:loading?"#9AB89A":"linear-gradient(135deg,#2E5339,#4A7C59)",color:"#fff",border:"none",borderRadius:13,padding:"14px",fontWeight:900,fontSize:16,boxShadow:"0 6px 20px rgba(46,83,57,.3)"}}>{loading?"⏳ Publication…":"Publier mon trajet gratuitement 🌿"}</button>
    </div></div>
  );
}

function AccountTab({session,profile,setProfile,toast}){
  const[name,setName]=useState(profile?.full_name||"");const[phone,setPhone]=useState(profile?.phone||"");const[avatarFile,setAvatarFile]=useState(null);const[avatarPreview,setAvatarPreview]=useState(profile?.avatar_url||null);const[saving,setSaving]=useState(false);const fileRef=useRef();
  const pickAvatar=e=>{const f=e.target.files?.[0];if(!f)return;setAvatarFile(f);const r=new FileReader();r.onload=ev=>setAvatarPreview(ev.target.result);r.readAsDataURL(f);};
  const handleSave=async()=>{if(!name.trim()){toast("Le nom est requis.","err");return;}setSaving(true);let avatar_url=profile?.avatar_url||null;if(avatarFile){const path=`${session.user.id}/avatar`;await sb.storage.from("avatars").upload(path,avatarFile,{upsert:true});const{data:{publicUrl}}=sb.storage.from("avatars").getPublicUrl(path);avatar_url=publicUrl+"?t="+Date.now();}await sb.from("profiles").upsert([{id:session.user.id,full_name:name,phone,avatar_url}]);setProfile({...profile,full_name:name,phone,avatar_url});setSaving(false);toast("Profil mis à jour ✓");};
  return(
    <div className="fade"><div style={{background:"#fff",borderRadius:18,padding:24,boxShadow:"0 2px 16px rgba(0,0,0,.07)",border:"1px solid #E2E8D8"}}>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:21,fontWeight:700,color:"#2E5339",marginBottom:22}}>Mon profil</div>
      <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:24,padding:"16px",background:"#F8FAF5",borderRadius:14,border:"1px solid #E2E8D8"}}>
        <div onClick={()=>fileRef.current.click()} style={{width:80,height:80,borderRadius:20,overflow:"hidden",cursor:"pointer",flexShrink:0,border:"2px dashed #B8D4A0",display:"flex",alignItems:"center",justifyContent:"center",background:avatarPreview?"transparent":"#EAF4E0"}}>{avatarPreview?<img src={avatarPreview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontWeight:900,fontSize:22,color:"#2E5339"}}>{initials(name||"?")}</span>}</div>
        <div><div style={{fontWeight:800,fontSize:15,color:"#2E5339"}}>{name||"Votre nom"}</div><div style={{fontSize:12,color:"#888",marginTop:2}}>{session.user.email}</div><button onClick={()=>fileRef.current.click()} style={{marginTop:8,background:"none",border:"1px solid #C8D5BE",borderRadius:7,padding:"5px 14px",fontSize:12,fontWeight:700,color:"#4A7C59"}}>📷 {avatarPreview?"Changer":"Ajouter une photo"}</button><input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} style={{display:"none"}}/></div>
      </div>
      <Sec title="Mes informations"><Fld label="Prénom et nom *"><input value={name} onChange={e=>setName(e.target.value)} style={IS()}/></Fld><Fld label="Téléphone"><input value={phone} onChange={e=>setPhone(e.target.value)} style={IS()}/></Fld></Sec>
      <button onClick={handleSave} disabled={saving} style={{width:"100%",background:saving?"#9AB89A":"linear-gradient(135deg,#2E5339,#4A7C59)",color:"#fff",border:"none",borderRadius:13,padding:"13px",fontWeight:900,fontSize:15}}>{saving?"⏳ Sauvegarde…":"Enregistrer"}</button>
    </div></div>
  );
}

function TripCard({trip,i,driver,isMine,seatsLeft,myBooking,onBook}){
  const recLabel={daily:"Tous les jours",weekly:"Chaque semaine",monthly:"Chaque mois",weekly_days:trip.recurrence_days?.map(d=>DAYS_SHORT[d]).join(", ")||"—"}[trip.recurrence_type];
  const bookingStatus=myBooking?.status;
  const btnLabel=bookingStatus==="pending"?"⏳ En attente…":bookingStatus==="accepted"?"✅ Confirmé":bookingStatus==="refused"?"✕ Refusé":seatsLeft===0?"Complet":"Réserver ce trajet";
  const btnDisabled=!!bookingStatus||seatsLeft===0;
  return(
    <div className={isMine?"":"lift"} style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #E2E8D8",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
      <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
        <Avatar profile={driver} size={46} style={{flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:8}}>
            <div style={{fontWeight:800,fontSize:15}}>{driver?.full_name||"…"}{isMine&&<span style={{marginLeft:8,background:"#EAF4E0",color:"#2E5339",fontSize:11,borderRadius:6,padding:"2px 8px",fontWeight:800}}>Moi</span>}</div>
            <div style={{display:"flex",gap:6}}><Chip accent="date">📅 {fmtDate(trip.occDate||trip.trip_date)}</Chip><Chip accent="time">🕐 {fmtTime(trip.trip_time)}</Chip></div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{display:"flex",gap:7,marginBottom:5}}><span>📍</span><span style={{fontSize:13,fontWeight:600}}>{trip.from_place}</span></div>
            <div style={{display:"flex",gap:7}}><span>🏁</span><span style={{fontSize:13}}><strong style={{color:"#2E5339"}}>{trip.to_city}</strong> — {trip.to_address}</span></div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:trip.note?8:0}}>
            <Chip accent={seatsLeft===0?"full":seatsLeft<=1?"low":"seat"}>💺 {seatsLeft} place{seatsLeft!==1?"s":""} restante{seatsLeft!==1?"s":""}</Chip>
            {trip.has_return&&<Chip accent="return">↩ Retour {fmtTime(trip.return_time)}</Chip>}
            {recLabel&&trip.recurrence_type!=="none"&&<Chip accent="recur">🔁 {recLabel}</Chip>}
          </div>
          {trip.note&&<div style={{background:"#F8FAF5",borderRadius:8,padding:"8px 10px",fontSize:12,color:"#666"}}>💬 {trip.note}</div>}
        </div>
      </div>
      {!isMine&&<button onClick={onBook} disabled={btnDisabled} style={{width:"100%",marginTop:14,background:btnDisabled?(bookingStatus==="accepted"?"#F0FDF4":bookingStatus==="refused"?"#FEF2F2":"#F2F5EE"):"#2E5339",color:btnDisabled?(bookingStatus==="accepted"?"#166534":bookingStatus==="refused"?"#DC2626":"#888"):"#fff",border:btnDisabled?"1.5px solid #DDE4D0":"none",borderRadius:10,padding:"10px",fontWeight:800,fontSize:14,cursor:btnDisabled?"default":"pointer"}}>{btnLabel}</button>}
    </div>
  );
}

function Avatar({profile,size=46,style={}}){const idx=Math.abs((profile?.full_name||"").charCodeAt(0)||0)%PALETTE.length;const[bg,tx]=PALETTE[idx];return<div style={{width:size,height:size,borderRadius:Math.floor(size*.28),overflow:"hidden",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:Math.floor(size*.3),color:tx,boxShadow:"0 2px 8px rgba(0,0,0,.1)",flexShrink:0,...style}}>{profile?.avatar_url?<img src={profile.avatar_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>:<span>{initials(profile?.full_name||"?")}</span>}</div>;}
const CHIP_S={default:["#F0F2EC","#555"],date:["#EAF4E0","#2E5339"],time:["#E8F4FD","#1A5276"],return:["#FEF9E7","#9A7D0A"],recur:["#F0EBF8","#6C3483"],seat:["#EAF4E0","#2E5339"],low:["#FEF3C7","#92400E"],full:["#FEF2F2","#DC2626"]};
function Chip({children,accent}){const[bg,col]=CHIP_S[accent]||CHIP_S.default;return<span style={{background:bg,color:col,borderRadius:7,padding:"3px 9px",fontSize:11,fontWeight:800,letterSpacing:.3}}>{children}</span>;}
function Sec({title,children}){return<div style={{marginBottom:20}}><div style={{fontSize:11,fontWeight:900,color:"#4A7C59",textTransform:"uppercase",letterSpacing:1.3,marginBottom:12,paddingBottom:6,borderBottom:"1px solid #E8EDE0"}}>{title}</div><div style={{display:"flex",flexDirection:"column",gap:10}}>{children}</div></div>;}
function Fld({label,children,err}){return<div>{label&&<label style={{display:"block",fontSize:12,fontWeight:800,color:err?"#DC2626":"#666",marginBottom:5}}>{label}</label>}{children}{err&&<div style={{fontSize:11,color:"#DC2626",marginTop:4,fontWeight:700}}>⚠ {err}</div>}</div>;}
function FldA({label,children}){return<div><label style={{display:"block",fontSize:12,fontWeight:800,color:"#666",marginBottom:5}}>{label}</label>{children}</div>;}
function IS(err){return{width:"100%",border:`1.5px solid ${err?"#FCA5A5":"#DDE4D0"}`,borderRadius:9,padding:"10px 12px",fontSize:14,color:"#2A2A1E",background:"#FAFCF7",transition:"all .2s"};}
function IA(){return{width:"100%",border:"1.5px solid #DDE4D0",borderRadius:9,padding:"10px 12px",fontSize:14,color:"#2A2A1E",background:"#FAFCF7",transition:"all .2s"};}
function Empty({label,sub}){return<div style={{textAlign:"center",padding:"56px 0"}}><div style={{fontSize:44,marginBottom:12}}>🍃</div><div style={{fontWeight:800,fontSize:16,color:"#888",marginBottom:6}}>{label}</div><div style={{fontSize:13,color:"#AAA"}}>{sub}</div></div>;}
function Toast({notif}){const c={ok:["#F0FDF4","#4ADE80","#166534"],warn:["#FEF3C7","#D97706","#92400E"],err:["#FEF2F2","#FECACA","#DC2626"]}[notif.type||"ok"];return<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:c[0],border:`1.5px solid ${c[1]}`,borderRadius:12,padding:"11px 22px",color:c[2],fontWeight:800,fontSize:14,boxShadow:"0 8px 30px rgba(0,0,0,.15)",animation:"toastIn .3s ease",whiteSpace:"nowrap",maxWidth:"92vw"}}>{notif.msg}</div>;}
function Spinner({full}){const s={width:36,height:36,border:"4px solid #E2E8D8",borderTop:"4px solid #2E5339",borderRadius:"50%",animation:"spin .8s linear infinite"};if(full)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}><div style={s}/></div>;return<div style={{display:"flex",justifyContent:"center",padding:"40px 0"}}><div style={s}/></div>;}
