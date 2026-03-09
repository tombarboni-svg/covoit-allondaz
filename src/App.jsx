import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ► CONFIGURATION — Remplacez ces 3 valeurs avant de déployer
//   Créez un projet gratuit sur https://supabase.com
//   Clés disponibles dans : Settings > API
// ═══════════════════════════════════════════════════════════════════════════════
const SUPABASE_URL      = "https://ypmfwkibmbcpquxxpglp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lACgcVY9ec84XtOOQfpBqw_SuUi-qzn";

// ► Pour les emails de notification, créez un compte gratuit sur https://emailjs.com
//   Puis renseignez vos identifiants EmailJS ci-dessous
const EMAILJS_SERVICE_ID  = "VOTRE_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "VOTRE_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "VOTRE_PUBLIC_KEY";

// ═══════════════════════════════════════════════════════════════════════════════
// SQL À EXÉCUTER UNE FOIS DANS SUPABASE > SQL Editor
// ═══════════════════════════════════════════════════════════════════════════════
/*
-- Profils utilisateurs
create table profiles (
  id uuid references auth.users primary key,
  full_name text not null,
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Lecture publique profils" on profiles for select using (true);
create policy "Modif propre profil"      on profiles for all    using (auth.uid() = id);

-- Trajets
create table trips (
  id               bigserial primary key,
  user_id          uuid references profiles(id) not null,
  from_place       text    not null,
  to_city          text    not null,
  to_address       text    not null,
  trip_date        date    not null,
  trip_time        time    not null,
  has_return       boolean default false,
  return_time      time,
  seats            integer default 3,
  note             text,
  recurrence_type  text    default 'none',
  recurrence_days  integer[],
  created_at       timestamptz default now()
);
alter table trips enable row level security;
create policy "Lecture publique trajets" on trips for select using (true);
create policy "Insertion propre"         on trips for insert with check (auth.uid() = user_id);
create policy "Suppression propre"       on trips for delete using (auth.uid() = user_id);

-- Bucket pour les photos de profil
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
create policy "Upload avatar" on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Lecture avatar" on storage.objects for select using (bucket_id = 'avatars');
create policy "Update avatar"  on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
*/

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT SUPABASE LÉGER
// ═══════════════════════════════════════════════════════════════════════════════
function createClient(url, key) {
  // Extraire la clé JWT anon depuis la clé publishable si besoin
  const anonKey = key.startsWith("sb_publishable_") ? key : key;
  const baseH = { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const ah = (tok) => tok ? { ...baseH, Authorization: `Bearer ${tok}` } : baseH;

  // Persistance session dans sessionStorage
  const SESSION_KEY = "covoit_session";
  let _session = null;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) _session = JSON.parse(stored);
  } catch(e) {}
  const listeners = [];

  const saveSession = (s) => {
    _session = s;
    try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
  };

  const auth = {
    async signUp({ email, password, options }) {
      const r = await fetch(`${url}/auth/v1/signup`, { method: "POST", headers: baseH, body: JSON.stringify({ email, password, data: options?.data || {} }) });
      const d = await r.json();
      if (d.access_token) { saveSession(d); listeners.forEach(fn => fn("SIGNED_IN", d)); }
      return { data: d, error: (d.error || d.msg) ? d : null };
    },
    async signInWithPassword({ email, password }) {
      const r = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: baseH, body: JSON.stringify({ email, password }) });
      const d = await r.json();
      if (d.access_token) { saveSession(d); listeners.forEach(fn => fn("SIGNED_IN", d)); }
      return { data: { session: d.access_token ? d : null }, error: d.error_description ? { message: d.error_description } : (d.msg ? { message: d.msg } : null) };
    },
    async signOut() {
      if (_session?.access_token) { try { await fetch(`${url}/auth/v1/logout`, { method: "POST", headers: ah(_session.access_token) }); } catch(e) {} }
      saveSession(null); listeners.forEach(fn => fn("SIGNED_OUT", null));
      return { error: null };
    },
    getSession() { return { data: { session: _session } }; },
    onAuthStateChange(fn) {
      listeners.push(fn);
      return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(fn), 1) } } };
    },
  };

  function from(table) {
    let _filters = [], _select = "*", _order = null, _limit = null;
    const u0 = () => { _filters=[]; _select="*"; _order=null; _limit=null; };
    const chain = {
      select(c) { _select=c; return chain; },
      eq(col,val) { _filters.push(`${col}=eq.${encodeURIComponent(val)}`); return chain; },
      gte(col,val) { _filters.push(`${col}=gte.${val}`); return chain; },
      order(col,opts) { _order=`${col}.${opts?.ascending===false?"desc":"asc"}`; return chain; },
      limit(n) { _limit=n; return chain; },
      async then(resolve) {
        let u = `${url}/rest/v1/${table}?select=${_select}`;
        _filters.forEach(f=>u+=`&${f}`);
        if(_order) u+=`&order=${_order}`;
        if(_limit) u+=`&limit=${_limit}`;
        const tok=_session?.access_token;
        const r=await fetch(u,{headers:{...ah(tok),Accept:"application/json","Prefer":"return=representation"}});
        const d=await r.json();
        resolve({data:Array.isArray(d)?d:[],error:r.ok?null:d});
      },
      async insert(rows) {
        const tok=_session?.access_token;
        const r=await fetch(`${url}/rest/v1/${table}`,{method:"POST",headers:{...ah(tok),Prefer:"return=representation"},body:JSON.stringify(rows)});
        const d=await r.json();
        return{data:d,error:r.ok?null:d};
      },
      async delete() {
        const tok=_session?.access_token;
        let u=`${url}/rest/v1/${table}?`;
        _filters.forEach(f=>u+=`${f}&`);
        const r=await fetch(u,{method:"DELETE",headers:ah(tok)});
        return{error:r.ok?null:await r.json()};
      },
      async upsert(rows) {
        const tok=_session?.access_token;
        const r=await fetch(`${url}/rest/v1/${table}?on_conflict=id`,{method:"POST",headers:{...ah(tok),Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(rows)});
        const d=await r.json();
        return{data:d,error:r.ok?null:d};
      },
    };
    return chain;
  }

  const storage = {
    from(bucket) {
      return {
        async upload(path, file) {
          const tok = _session?.access_token;
          const r = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
            method: "POST", headers: { ...ah(tok), "Content-Type": file.type, "x-upsert": "true" },
            body: file,
          });
          const d = await r.json();
          return { data: d, error: r.ok ? null : d };
        },
        getPublicUrl(path) {
          return { data: { publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}` } };
        },
      };
    },
  };

  return { auth, from, storage };
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════════════════════
// EMAILJS — envoie un email de notification au conducteur
// ═══════════════════════════════════════════════════════════════════════════════
async function sendContactEmail({ driverName, driverEmail, passengerName, passengerPhone, fromPlace, toCity, toAddress, tripDate, tripTime }) {
  if (!EMAILJS_SERVICE_ID || EMAILJS_SERVICE_ID === "VOTRE_SERVICE_ID") return; // pas configuré
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_name: driverName, to_email: driverEmail,
          passenger_name: passengerName, passenger_phone: passengerPhone || "non renseigné",
          from_place: fromPlace, to_city: toCity, to_address: toAddress,
          trip_date: tripDate, trip_time: tripTime,
        },
      }),
    });
  } catch (e) { console.warn("Email non envoyé:", e); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════
const VILLAGE     = "Allondaz";
const DESTINATIONS = ["Annecy", "Albertville", "Ugine", "Chambéry"];
const KNOWN_PLACES = ["Place de l'Église, Allondaz","Mairie d'Allondaz","Arrêt de bus Allondaz","Salle des fêtes, Allondaz","École d'Allondaz"];
const DAYS_FR     = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const DAYS_SHORT  = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
const MONTHS_FR   = ["Janv.","Févr.","Mars","Avr.","Mai","Juin","Juil.","Août","Sept.","Oct.","Nov.","Déc."];
const TODAY       = new Date().toISOString().split("T")[0];
const PALETTE     = [["#E8F4FD","#1A5276"],["#E9F7EF","#1E8449"],["#FEF9E7","#9A7D0A"],["#FDEDEC","#922B21"],["#F5EEF8","#6C3483"],["#EBF5FB","#154360"]];

function fmtDate(d) { if(!d)return""; const dt=new Date(d+"T00:00:00"); return`${dt.getDate()} ${MONTHS_FR[dt.getMonth()]} ${dt.getFullYear()}`; }
function fmtTime(t) { return t?t.slice(0,5):""; }
function initials(n) { return(n||"?").split(" ").filter(Boolean).map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function dayOfWeek(d) { return new Date(d+"T00:00:00").getDay(); }

function getOccurrences(trip) {
  const type = trip.recurrence_type;
  if (!type || type==="none") return [trip.trip_date];
  const out=[]; const max=new Date(); max.setDate(max.getDate()+60);
  let cur=new Date(trip.trip_date+"T00:00:00");
  while(cur<=max && out.length<30){
    const iso=cur.toISOString().split("T")[0];
    if(iso>=TODAY) out.push(iso);
    if(type==="daily") cur.setDate(cur.getDate()+1);
    else if(type==="weekly_days"){ do{cur.setDate(cur.getDate()+1);}while(!trip.recurrence_days?.includes(cur.getDay())&&cur<=max); }
    else if(type==="weekly") cur.setDate(cur.getDate()+7);
    else if(type==="monthly") cur.setMonth(cur.getMonth()+1);
    else break;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Playfair+Display:wght@600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#F2F5EE;}
button{cursor:pointer;font-family:inherit;}
input,select,textarea{font-family:inherit;outline:none;}
textarea{resize:vertical;}
.lift{transition:transform .2s,box-shadow .2s;}
.lift:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(0,0,0,.13)!important;}
.fade{animation:fadeUp .3s ease both;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes toastIn{from{opacity:0;transform:translateY(-14px)scale(.97)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
input:focus,select:focus,textarea:focus{border-color:#4A7C59!important;box-shadow:0 0 0 3px rgba(74,124,89,.2)!important;}
.day-btn{transition:all .15s;}
.day-btn:hover{background:#4A7C59!important;color:#fff!important;}
::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:#C8D5BE;border-radius:3px;}
.avatar-ring{transition:box-shadow .2s;}
.avatar-ring:hover{box-shadow:0 0 0 3px #4A7C59!important;}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady]     = useState(false);
  const [authView, setAuthView] = useState("login");
  const [notif, setNotif]     = useState(null);

  const toast = useCallback((msg, type="ok") => {
    setNotif({msg,type}); setTimeout(()=>setNotif(null),3500);
  }, []);

  useEffect(() => {
    const {data:{session:s}} = sb.auth.getSession();
    setSession(s); setReady(true);
    const {data:{subscription}} = sb.auth.onAuthStateChange((ev,s) => {
      setSession(s); if(ev==="SIGNED_OUT") setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    sb.from("profiles").select("*").eq("id", session.user.id).then(({data}) => { if(data?.[0]) setProfile(data[0]); });
  }, [session]);

  if (!ready) return <Spinner full />;

  return (
    <div style={{fontFamily:"'Nunito',sans-serif",minHeight:"100vh",background:"#F2F5EE",color:"#2A2A1E"}}>
      <style>{CSS}</style>
      {notif && <Toast notif={notif} />}
      {!session
        ? <AuthScreen view={authView} setView={setAuthView} toast={toast} onLogin={setSession} onProfileCreated={setProfile} />
        : <MainApp session={session} profile={profile} setProfile={setProfile} toast={toast} />
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function AuthScreen({ view, setView, toast, onLogin, onProfileCreated }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");
  const fileRef = useRef();

  const pickAvatar = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setAvatarFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleLogin = async () => {
    if (!email || !password) { setErr("Remplissez tous les champs."); return; }
    setLoading(true); setErr("");
    const {data,error} = await sb.auth.signInWithPassword({email,password});
    setLoading(false);
    if (error) { setErr("Email ou mot de passe incorrect."); return; }
    onLogin(data.session); toast("Bienvenue ! 👋");
  };

  const handleRegister = async () => {
    if (!email || !password || !fullName) { setErr("Prénom/nom, email et mot de passe sont requis."); return; }
    if (password.length < 6) { setErr("Le mot de passe doit faire au moins 6 caractères."); return; }
    setLoading(true); setErr("");
    const {data,error} = await sb.auth.signUp({email, password, options:{data:{full_name:fullName}}});
    if (error || !data?.user?.id) { setLoading(false); setErr("Erreur d'inscription. Cet email est peut-être déjà utilisé."); return; }

    // Upload avatar
    let avatar_url = null;
    if (avatarFile) {
      const path = `${data.user.id}/avatar`;
      await sb.storage.from("avatars").upload(path, avatarFile);
      avatar_url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    await sb.from("profiles").upsert([{id:data.user.id, full_name:fullName, phone, avatar_url}]);
    onProfileCreated({id:data.user.id, full_name:fullName, phone, avatar_url});
    setLoading(false);
    toast("Compte créé ! Bienvenue à Allondaz 🌿");
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,background:"linear-gradient(160deg,#F2F5EE 0%,#E0EBD5 100%)"}}>
      {/* Hero */}
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:54,marginBottom:8,filter:"drop-shadow(0 4px 8px rgba(0,0,0,.12))"}}>🏔️</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:700,color:"#2E5339",lineHeight:1}}>Covoit' {VILLAGE}</div>
        <div style={{fontSize:13,color:"#6A8A60",marginTop:6,fontWeight:700,letterSpacing:.5}}>Annecy · Albertville · Ugine · Chambéry</div>
        <div style={{marginTop:8,fontSize:13,color:"#9AAA8A",fontWeight:600}}>Trajets gratuits entre voisins 🌻</div>
      </div>

      <div style={{background:"#fff",borderRadius:22,padding:28,width:"100%",maxWidth:420,boxShadow:"0 8px 40px rgba(0,0,0,.12)",border:"1px solid #E2E8D8"}}>
        {/* Tabs */}
        <div style={{display:"flex",background:"#F2F5EE",borderRadius:12,padding:4,marginBottom:22}}>
          {[["login","Se connecter"],["register","S'inscrire"]].map(([v,l])=>(
            <button key={v} onClick={()=>{setView(v);setErr("");}} style={{flex:1,padding:"9px",borderRadius:9,border:"none",fontWeight:800,fontSize:13,background:view===v?"#fff":"transparent",color:view===v?"#2E5339":"#888",boxShadow:view===v?"0 2px 8px rgba(0,0,0,.08)":"none",transition:"all .2s"}}>{l}</button>
          ))}
        </div>

        {err && <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 14px",color:"#DC2626",fontSize:13,fontWeight:700,marginBottom:16}}>⚠ {err}</div>}

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {view==="register" && (
            <>
              {/* Avatar picker */}
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:4}}>
                <div onClick={()=>fileRef.current.click()} className="avatar-ring" style={{width:72,height:72,borderRadius:18,background:avatarPreview?"transparent":"#EAF4E0",overflow:"hidden",cursor:"pointer",flexShrink:0,border:"2px dashed #B8D4A0",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 10px rgba(0,0,0,.08)"}}>
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                    : <span style={{fontSize:28}}>📷</span>
                  }
                </div>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:"#2E5339"}}>Photo de profil</div>
                  <div style={{fontSize:12,color:"#888",marginTop:2}}>Les voisins vous reconnaîtront</div>
                  <button onClick={()=>fileRef.current.click()} style={{marginTop:6,background:"none",border:"1px solid #C8D5BE",borderRadius:7,padding:"4px 12px",fontSize:12,fontWeight:700,color:"#4A7C59"}}>
                    {avatarPreview ? "Changer" : "Choisir une photo"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} style={{display:"none"}} />
                </div>
              </div>

              <FldA label="Prénom et nom *"><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="ex : Marie Dupont" style={IA()} /></FldA>
              <FldA label="Téléphone (visible par les passagers)"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="06 12 34 56 78" style={IA()} /></FldA>
            </>
          )}
          <FldA label="Email *"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.fr" style={IA()} /></FldA>
          <FldA label="Mot de passe *"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={view==="register"?"Au moins 6 caractères":"••••••••"} style={IA()} /></FldA>
        </div>

        <button onClick={view==="login"?handleLogin:handleRegister} disabled={loading} style={{width:"100%",marginTop:20,background:loading?"#9AB89A":"linear-gradient(135deg,#2E5339,#4A7C59)",color:"#fff",border:"none",borderRadius:13,padding:"14px",fontWeight:900,fontSize:16,boxShadow:"0 6px 20px rgba(46,83,57,.3)",transition:"all .2s"}}>
          {loading?"⏳ Chargement…":view==="login"?"Se connecter →":"Créer mon compte 🌿"}
        </button>

        <div style={{textAlign:"center",marginTop:14,fontSize:12,color:"#888"}}>
          {view==="login"?"Pas encore de compte ? ":"Déjà inscrit ? "}
          <button onClick={()=>{setView(view==="login"?"register":"login");setErr("");}} style={{background:"none",border:"none",color:"#4A7C59",fontWeight:800,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
            {view==="login"?"S'inscrire gratuitement":"Se connecter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
function MainApp({ session, profile, setProfile, toast }) {
  const [tab, setTab]       = useState("search");
  const [trips, setTrips]   = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [driverModal, setDriverModal] = useState(null); // {driver, trip}

  const [sCity, setSCity] = useState("");
  const [sDate, setSDate] = useState("");
  const [searched, setSearched] = useState(false);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    const {data} = await sb.from("trips").select("*").gte("trip_date", TODAY).order("trip_date",{ascending:true});
    const list = data||[];
    setTrips(list);
    const uids = [...new Set(list.map(t=>t.user_id))];
    const map = {};
    for (const uid of uids) {
      const {data:pd} = await sb.from("profiles").select("*").eq("id",uid);
      if (pd?.[0]) map[uid] = pd[0];
    }
    setProfilesMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  const flatTrips = useMemo(() => {
    const out = [];
    trips.forEach(t => getOccurrences(t).forEach(d => out.push({...t, occDate:d})));
    return out.sort((a,b)=>a.occDate.localeCompare(b.occDate)||a.trip_time.localeCompare(b.trip_time));
  }, [trips]);

  const displayList = useMemo(() => {
    if (!searched) return flatTrips.slice(0,20);
    return flatTrips.filter(t => (!sCity||t.to_city===sCity) && (!sDate||t.occDate===sDate));
  }, [flatTrips, searched, sCity, sDate]);

  const myTrips = trips.filter(t => t.user_id === session.user.id);

  const handleContact = async (trip, driver) => {
    setDriverModal({driver, trip});
    // Envoyer email de notification au conducteur
    if (profile && driver) {
      await sendContactEmail({
        driverName: driver.full_name,
        driverEmail: session.user.email, // en prod : récupérer l'email du conducteur via Supabase Admin
        passengerName: profile.full_name,
        passengerPhone: profile.phone,
        fromPlace: trip.from_place,
        toCity: trip.to_city,
        toAddress: trip.to_address,
        tripDate: fmtDate(trip.occDate||trip.trip_date),
        tripTime: fmtTime(trip.trip_time),
      });
    }
  };

  const handleDelete = async (id) => {
    await sb.from("trips").eq("id",id).delete();
    setTrips(p=>p.filter(t=>t.id!==id));
    toast("Trajet supprimé.","warn");
  };

  return (
    <div>
      {/* HEADER */}
      <header style={{background:"linear-gradient(135deg,#2E5339 0%,#4A7C59 100%)",color:"#fff",boxShadow:"0 4px 20px rgba(46,83,57,.4)"}}>
        <div style={{maxWidth:760,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:28}}>🏔️</div>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,lineHeight:1.1}}>Covoit' {VILLAGE}</div>
                <div style={{fontSize:11,color:"#B8D4A0",fontWeight:600}}>Annecy · Albertville · Ugine · Chambéry</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {/* Mini avatar header */}
              <Avatar profile={profile} size={36} />
              <div style={{display:"none"}}>
                <div style={{fontSize:13,fontWeight:800}}>{profile?.full_name}</div>
              </div>
              <button onClick={()=>sb.auth.signOut()} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"6px 12px",color:"#fff",fontSize:12,fontWeight:700}}>
                Déconnexion
              </button>
            </div>
          </div>
          <div style={{display:"flex",gap:1,background:"rgba(0,0,0,.15)",borderRadius:"10px 10px 0 0",overflow:"hidden"}}>
            {[["search","🔍 Trajets"],["publish","➕ Proposer"],["mine","📋 Mes trajets"],["account","👤 Mon profil"]].map(([key,label])=>(
              <button key={key} onClick={()=>setTab(key)} style={{flex:1,background:tab===key?"rgba(255,255,255,.18)":"transparent",border:"none",color:tab===key?"#fff":"rgba(255,255,255,.55)",fontWeight:tab===key?800:600,fontSize:12,padding:"10px 4px",borderBottom:tab===key?"3px solid #A8D070":"3px solid transparent",transition:"all .2s"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{maxWidth:760,margin:"0 auto",padding:"20px 16px 60px"}}>

        {/* ── TRAJETS ── */}
        {tab==="search" && (
          <div className="fade">
            <SearchBar sCity={sCity} setSCity={setSCity} sDate={sDate} setSDate={setSDate} searched={searched} onSearch={()=>setSearched(true)} onReset={()=>{setSearched(false);setSCity("");setSDate("");}} />
            <STitle right={<span style={{fontSize:12,color:"#888",fontWeight:600}}>{displayList.length} trajet{displayList.length!==1?"s":""}</span>}>
              {searched?"Résultats":"Tous les trajets à venir"}
            </STitle>
            {loading ? <Spinner inline /> : displayList.length===0
              ? <Empty label="Aucun trajet trouvé" sub="Essayez une autre date ou proposez votre aide" />
              : <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {displayList.map((t,i)=>(
                    <TripCard key={`${t.id}-${t.occDate}`} trip={t} i={i} driver={profilesMap[t.user_id]} isMine={t.user_id===session.user.id} onContact={()=>handleContact(t, profilesMap[t.user_id])} />
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── PROPOSER ── */}
        {tab==="publish" && (
          <PublishForm session={session} profile={profile} toast={toast} onPublished={(trip)=>{setTrips(p=>[trip,...p]);setTab("mine");}} />
        )}

        {/* ── MES TRAJETS ── */}
        {tab==="mine" && (
          <div className="fade">
            <STitle>Mes trajets</STitle>
            {myTrips.length===0
              ? <Empty label="Aucun trajet publié" sub={<Lnk onClick={()=>setTab("publish")}>Proposer un trajet</Lnk>} />
              : <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {myTrips.map((t,i)=>{
                    const occ=getOccurrences(t);
                    return (
                      <div key={t.id} style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8D8",overflow:"hidden",boxShadow:"0 2px 14px rgba(0,0,0,.07)"}}>
                        <TripCard trip={{...t,occDate:t.trip_date}} i={i} driver={profile} isMine />
                        {t.recurrence_type!=="none" && occ.length>0 && (
                          <div style={{padding:"10px 18px 14px",background:"#F8FAF5",borderTop:"1px solid #E2E8D8"}}>
                            <div style={{fontSize:11,fontWeight:800,color:"#4A7C59",textTransform:"uppercase",letterSpacing:1,marginBottom:7}}>Prochaines dates</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                              {occ.slice(0,6).map(d=><span key={d} style={{background:"#EAF4E0",color:"#2E5339",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>{fmtDate(d)}</span>)}
                              {occ.length>6 && <span style={{fontSize:12,color:"#888",fontWeight:700,padding:"3px 6px"}}>+{occ.length-6} autres…</span>}
                            </div>
                          </div>
                        )}
                        <div style={{padding:"0 18px 16px"}}>
                          <button onClick={()=>handleDelete(t.id)} style={{width:"100%",background:"none",border:"1.5px solid #FECACA",color:"#DC2626",borderRadius:10,padding:"9px",fontWeight:800,fontSize:13}}>Supprimer ce trajet</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* ── MON PROFIL ── */}
        {tab==="account" && (
          <AccountTab session={session} profile={profile} setProfile={setProfile} toast={toast} />
        )}
      </main>

      {/* MODAL PROFIL CONDUCTEUR */}
      {driverModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}} onClick={()=>setDriverModal(null)}>
          <div className="fade" style={{background:"#fff",borderRadius:22,padding:28,maxWidth:380,width:"100%",boxShadow:"0 30px 80px rgba(0,0,0,.25)"}} onClick={e=>e.stopPropagation()}>
            {/* Photo + nom */}
            <div style={{textAlign:"center",marginBottom:20}}>
              <Avatar profile={driverModal.driver} size={80} style={{margin:"0 auto 14px"}} />
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:"#2E5339"}}>{driverModal.driver?.full_name||"…"}</div>
              <div style={{fontSize:13,color:"#888",marginTop:2}}>Conducteur bénévole 🌿</div>
            </div>

            {/* Récap trajet */}
            <div style={{background:"#F8FAF5",borderRadius:12,padding:14,marginBottom:18,border:"1px solid #E2E8D8"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:6}}>
                <span style={{fontSize:15}}>📍</span>
                <span style={{fontSize:13,color:"#444",fontWeight:600}}>{driverModal.trip.from_place}</span>
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:8}}>
                <span style={{fontSize:15}}>🏁</span>
                <span style={{fontSize:13}}><strong style={{color:"#2E5339"}}>{driverModal.trip.to_city}</strong> — {driverModal.trip.to_address}</span>
              </div>
              <div style={{fontSize:13,color:"#888"}}>📅 {fmtDate(driverModal.trip.occDate||driverModal.trip.trip_date)} à {fmtTime(driverModal.trip.trip_time)}</div>
              {driverModal.trip.has_return && <div style={{fontSize:12,color:"#888",marginTop:2}}>↩ Retour prévu ~{fmtTime(driverModal.trip.return_time)}</div>}
            </div>

            {/* Appel */}
            {driverModal.driver?.phone
              ? <a href={`tel:${driverModal.driver.phone.replace(/\s/g,"")}`} style={{display:"block",textAlign:"center",background:"linear-gradient(135deg,#2E5339,#4A7C59)",color:"#fff",borderRadius:12,padding:"13px",fontWeight:900,fontSize:16,textDecoration:"none",marginBottom:10,boxShadow:"0 6px 20px rgba(46,83,57,.3)"}}>
                  📞 Appeler le {driverModal.driver.phone}
                </a>
              : <div style={{background:"#FEF3C7",borderRadius:10,padding:"12px",color:"#92400E",fontSize:13,fontWeight:700,textAlign:"center",marginBottom:10}}>
                  Pas de téléphone renseigné.<br/>Passez à la mairie du village.
                </div>
            }

            <div style={{fontSize:12,color:"#AAA",textAlign:"center",marginBottom:12}}>
              {EMAILJS_SERVICE_ID!=="VOTRE_SERVICE_ID"
                ? "✉️ Une notification a été envoyée au conducteur"
                : "Contactez directement le conducteur par téléphone"}
            </div>

            <button onClick={()=>setDriverModal(null)} style={{width:"100%",background:"none",border:"1.5px solid #DDE4D0",borderRadius:10,padding:"10px",color:"#888",fontWeight:700,fontSize:14}}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLISH FORM
// ═══════════════════════════════════════════════════════════════════════════════
function PublishForm({ session, profile, toast, onPublished }) {
  const empty = () => ({fromPlaceMode:"known",fromPlace:KNOWN_PLACES[0],fromAddress:"",toCity:DESTINATIONS[0],toAddress:"",date:"",time:"",hasReturn:false,returnTime:"",seats:"3",note:"",recurrence:{type:"none",days:[]}});
  const [form, setForm] = useState(empty());
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(false);

  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const fr=(k,v)=>setForm(p=>({...p,recurrence:{...p.recurrence,[k]:v}}));
  const toggleDay=d=>fr("days",form.recurrence.days.includes(d)?form.recurrence.days.filter(x=>x!==d):[...form.recurrence.days,d].sort());

  const validate=()=>{
    const e={};
    if(!form.date) e.date="Requis";
    if(!form.time) e.time="Requis";
    const dep=form.fromPlaceMode==="known"?form.fromPlace:form.fromAddress;
    if(!dep.trim()) e.from="Lieu de départ requis";
    if(!form.toAddress.trim()) e.toAddress="Adresse requise";
    if(form.hasReturn&&!form.returnTime) e.returnTime="Requis";
    if(form.recurrence.type==="weekly_days"&&form.recurrence.days.length===0) e.days="Choisissez au moins un jour";
    return e;
  };

  const handleSubmit=async()=>{
    const e=validate(); setErrs(e);
    if(Object.keys(e).length>0) return;
    setLoading(true);
    const row={
      user_id:session.user.id,
      from_place:form.fromPlaceMode==="known"?form.fromPlace:form.fromAddress,
      to_city:form.toCity, to_address:form.toAddress,
      trip_date:form.date, trip_time:form.time,
      has_return:form.hasReturn, return_time:form.hasReturn?form.returnTime:null,
      seats:parseInt(form.seats), note:form.note,
      recurrence_type:form.recurrence.type,
      recurrence_days:form.recurrence.type==="weekly_days"?form.recurrence.days:null,
    };
    const {data,error}=await sb.from("trips").insert([row]);
    setLoading(false);
    if(error||!data?.[0]){toast("Erreur lors de la publication.","err");return;}
    toast("Trajet publié ! Merci 🌻");
    setForm(empty()); setErrs({});
    onPublished(data[0]);
  };

  const recOpts=[["none","🔂 Unique","Sans répétition"],["daily","📅 Tous les jours","Chaque jour"],["weekly_days","📆 Jours choisis","Lun, mer…"],["weekly","🗓 Chaque semaine","Même jour"],["monthly","🗃 Chaque mois","Même date"]];

  return (
    <div className="fade">
      <div style={{background:"#fff",borderRadius:18,padding:24,boxShadow:"0 2px 16px rgba(0,0,0,.07)",border:"1px solid #E2E8D8"}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:21,fontWeight:700,color:"#2E5339",marginBottom:3}}>Proposer un trajet</div>
        <div style={{fontSize:13,color:"#8A9A7A",marginBottom:22}}>100 % gratuit — merci pour votre solidarité 🌿</div>

        <Sec title="Point de départ à Allondaz">
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {[["known","📍 Lieu connu"],["custom","✏️ Adresse libre"]].map(([v,l])=>(
              <button key={v} onClick={()=>f("fromPlaceMode",v)} style={{flex:1,padding:"9px",borderRadius:9,fontWeight:700,fontSize:13,background:form.fromPlaceMode===v?"#2E5339":"#F2F5EE",color:form.fromPlaceMode===v?"#fff":"#666",border:`1.5px solid ${form.fromPlaceMode===v?"#2E5339":"#DDE4D0"}`}}>{l}</button>
            ))}
          </div>
          <Fld err={errs.from}>
            {form.fromPlaceMode==="known"
              ?<select value={form.fromPlace} onChange={e=>f("fromPlace",e.target.value)} style={IS()}>{KNOWN_PLACES.map(p=><option key={p} value={p}>{p}</option>)}</select>
              :<input value={form.fromAddress} onChange={e=>f("fromAddress",e.target.value)} placeholder="ex : 12 route des Chalets, Allondaz" style={IS(errs.from)} />
            }
          </Fld>
        </Sec>

        <Sec title="Destination">
          <Row2>
            <Fld label="Ville *"><select value={form.toCity} onChange={e=>f("toCity",e.target.value)} style={IS()}>{DESTINATIONS.map(c=><option key={c} value={c}>{c}</option>)}</select></Fld>
            <Fld label="Adresse précise *" err={errs.toAddress}><input value={form.toAddress} onChange={e=>f("toAddress",e.target.value)} placeholder="Gare, marché, hôpital…" style={IS(errs.toAddress)} /></Fld>
          </Row2>
        </Sec>

        <Sec title="Date et horaires">
          <Row2>
            <Fld label="Date *" err={errs.date}><input type="date" min={TODAY} value={form.date} onChange={e=>f("date",e.target.value)} style={IS(errs.date)} /></Fld>
            <Fld label="Heure de départ *" err={errs.time}><input type="time" value={form.time} onChange={e=>f("time",e.target.value)} style={IS(errs.time)} /></Fld>
          </Row2>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <input type="checkbox" checked={form.hasReturn} onChange={e=>f("hasReturn",e.target.checked)} style={{width:18,height:18,accentColor:"#2E5339"}} />
            <span style={{fontSize:14,fontWeight:700,color:"#444"}}>Je propose aussi le retour</span>
          </label>
          {form.hasReturn&&<Fld label="Heure de retour *" err={errs.returnTime}><input type="time" value={form.returnTime} onChange={e=>f("returnTime",e.target.value)} style={{...IS(errs.returnTime),maxWidth:200}} /></Fld>}
        </Sec>

        <Sec title="Récurrence">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {recOpts.map(([v,title,sub])=>(
              <button key={v} onClick={()=>fr("type",v)} style={{textAlign:"left",padding:"10px 12px",borderRadius:10,background:form.recurrence.type===v?"#EAF4E0":"#F2F5EE",border:`1.5px solid ${form.recurrence.type===v?"#4A7C59":"#DDE4D0"}`,transition:"all .15s"}}>
                <div style={{fontWeight:800,fontSize:13,color:form.recurrence.type===v?"#2E5339":"#444"}}>{title}</div>
                <div style={{fontSize:11,color:"#888",marginTop:2}}>{sub}</div>
              </button>
            ))}
          </div>
          {form.recurrence.type==="weekly_days"&&(
            <div style={{marginTop:10}}>
              <div style={{fontSize:12,fontWeight:800,color:errs.days?"#DC2626":"#666",marginBottom:8}}>Jours actifs * {errs.days&&<span style={{color:"#DC2626"}}>— {errs.days}</span>}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {DAYS_SHORT.map((d,i)=><button key={i} className="day-btn" onClick={()=>toggleDay(i)} style={{width:44,height:44,borderRadius:10,fontWeight:800,fontSize:13,border:"1.5px solid",background:form.recurrence.days.includes(i)?"#2E5339":"#F2F5EE",color:form.recurrence.days.includes(i)?"#fff":"#666",borderColor:form.recurrence.days.includes(i)?"#2E5339":"#DDE4D0"}}>{d}</button>)}
              </div>
              {form.recurrence.days.length>0&&<div style={{fontSize:11,color:"#4A7C59",fontWeight:700,marginTop:6}}>✓ {form.recurrence.days.map(d=>DAYS_FR[d]).join(", ")}</div>}
            </div>
          )}
          {form.recurrence.type==="weekly"&&form.date&&<InfoBox>✓ Répété tous les {DAYS_FR[dayOfWeek(form.date)]}</InfoBox>}
          {form.recurrence.type==="monthly"&&form.date&&<InfoBox>✓ Répété le {new Date(form.date+"T00:00").getDate()} de chaque mois</InfoBox>}
          {form.recurrence.type==="daily"&&<InfoBox>✓ Répété chaque jour pendant 60 jours</InfoBox>}
        </Sec>

        <Sec title="Infos complémentaires">
          <Row2>
            <Fld label="Places disponibles"><select value={form.seats} onChange={e=>f("seats",e.target.value)} style={IS()}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} place{n>1?"s":""}</option>)}</select></Fld>
            <Fld label="Message aux passagers"><textarea value={form.note} onChange={e=>f("note",e.target.value)} placeholder="Infos utiles…" rows={2} style={IS()} /></Fld>
          </Row2>
        </Sec>

        <button onClick={handleSubmit} disabled={loading} style={{width:"100%",background:loading?"#9AB89A":"linear-gradient(135deg,#2E5339,#4A7C59)",color:"#fff",border:"none",borderRadius:13,padding:"14px",fontWeight:900,fontSize:16,boxShadow:"0 6px 20px rgba(46,83,57,.3)"}}>
          {loading?"⏳ Publication…":"Publier mon trajet gratuitement 🌿"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AccountTab({ session, profile, setProfile, toast }) {
  const [name, setName]   = useState(profile?.full_name||"");
  const [phone, setPhone] = useState(profile?.phone||"");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url||null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const pickAvatar = (e) => {
    const f=e.target.files?.[0]; if(!f) return;
    setAvatarFile(f);
    const r=new FileReader(); r.onload=(ev)=>setAvatarPreview(ev.target.result); r.readAsDataURL(f);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast("Le nom est requis.","err"); return; }
    setSaving(true);
    let avatar_url = profile?.avatar_url||null;
    if (avatarFile) {
      const path=`${session.user.id}/avatar`;
      await sb.storage.from("avatars").upload(path,avatarFile);
      avatar_url=sb.storage.from("avatars").getPublicUrl(path).data.publicUrl+"?t="+Date.now();
    }
    await sb.from("profiles").upsert([{id:session.user.id,full_name:name,phone,avatar_url}]);
    setProfile({...profile,full_name:name,phone,avatar_url});
    setSaving(false);
    toast("Profil mis à jour ✓");
  };

  return (
    <div className="fade">
      <div style={{background:"#fff",borderRadius:18,padding:24,boxShadow:"0 2px 16px rgba(0,0,0,.07)",border:"1px solid #E2E8D8"}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:21,fontWeight:700,color:"#2E5339",marginBottom:22}}>Mon profil</div>

        {/* Avatar */}
        <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:24,padding:"16px",background:"#F8FAF5",borderRadius:14,border:"1px solid #E2E8D8"}}>
          <div onClick={()=>fileRef.current.click()} className="avatar-ring" style={{width:80,height:80,borderRadius:20,overflow:"hidden",cursor:"pointer",flexShrink:0,border:"2px dashed #B8D4A0",display:"flex",alignItems:"center",justifyContent:"center",background:avatarPreview?"transparent":"#EAF4E0",boxShadow:"0 4px 16px rgba(0,0,0,.1)"}}>
            {avatarPreview
              ?<img src={avatarPreview} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}} />
              :<span style={{fontWeight:900,fontSize:22,color:"#2E5339"}}>{initials(name||"?")}</span>
            }
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:"#2E5339"}}>{name||"Votre nom"}</div>
            <div style={{fontSize:12,color:"#888",marginTop:2}}>{session.user.email}</div>
            <button onClick={()=>fileRef.current.click()} style={{marginTop:8,background:"none",border:"1px solid #C8D5BE",borderRadius:7,padding:"5px 14px",fontSize:12,fontWeight:700,color:"#4A7C59"}}>
              📷 {avatarPreview?"Changer la photo":"Ajouter une photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} style={{display:"none"}} />
          </div>
        </div>

        <Sec title="Mes informations">
          <Fld label="Prénom et nom *"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Marie Dupont" style={IS()} /></Fld>
          <Fld label="Téléphone (visible par les passagers)"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="06 12 34 56 78" style={IS()} /></Fld>
        </Sec>

        <button onClick={handleSave} disabled={saving} style={{width:"100%",background:saving?"#9AB89A":"linear-gradient(135deg,#2E5339,#4A7C59)",color:"#fff",border:"none",borderRadius:13,padding:"13px",fontWeight:900,fontSize:15,boxShadow:"0 6px 20px rgba(46,83,57,.25)"}}>
          {saving?"⏳ Sauvegarde…":"Enregistrer les modifications"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIP CARD
// ═══════════════════════════════════════════════════════════════════════════════
function TripCard({ trip, i, driver, isMine, onContact }) {
  const recLabel = {daily:"Tous les jours",weekly:"Chaque semaine",monthly:"Chaque mois",weekly_days:trip.recurrence_days?.map(d=>DAYS_SHORT[d]).join(", ")||"—"}[trip.recurrence_type];
  return (
    <div className={isMine?"":"lift"} style={{background:"#fff",borderRadius:14,padding:18,border:"1px solid #E2E8D8",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
      <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
        <Avatar profile={driver} size={46} style={{flexShrink:0}} />
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:8}}>
            <div style={{fontWeight:800,fontSize:15}}>
              {driver?.full_name||"…"}
              {isMine&&<span style={{marginLeft:8,background:"#EAF4E0",color:"#2E5339",fontSize:11,borderRadius:6,padding:"2px 8px",fontWeight:800}}>Moi</span>}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Chip accent="date">📅 {fmtDate(trip.occDate||trip.trip_date)}</Chip>
              <Chip accent="time">🕐 {fmtTime(trip.trip_time)}</Chip>
            </div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:5}}>
              <span style={{fontSize:16,flexShrink:0,marginTop:1}}>📍</span>
              <span style={{fontSize:13,color:"#444",fontWeight:600}}>{trip.from_place}</span>
            </div>
            <div style={{display:"flex",alignItems:"flex-start",gap:7}}>
              <span style={{fontSize:16,flexShrink:0,marginTop:1}}>🏁</span>
              <span style={{fontSize:13}}><strong style={{color:"#2E5339"}}>{trip.to_city}</strong> — {trip.to_address}</span>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:trip.note?8:0}}>
            <Chip>💺 {trip.seats} place{trip.seats>1?"s":""}</Chip>
            {trip.has_return&&<Chip accent="return">↩ Retour {fmtTime(trip.return_time)}</Chip>}
            {recLabel&&trip.recurrence_type!=="none"&&<Chip accent="recur">🔁 {recLabel}</Chip>}
          </div>
          {trip.note&&<div style={{background:"#F8FAF5",borderRadius:8,padding:"8px 10px",fontSize:12,color:"#666",lineHeight:1.5}}>💬 {trip.note}</div>}
        </div>
      </div>
      {!isMine&&onContact&&(
        <button onClick={onContact} style={{width:"100%",marginTop:14,background:"#2E5339",color:"#fff",border:"none",borderRadius:10,padding:"10px",fontWeight:800,fontSize:14}}>
          Voir le profil & contacter →
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AVATAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function Avatar({ profile, size=46, style={} }) {
  const [bg] = PALETTE[Math.abs((profile?.full_name||"").charCodeAt(0)||0) % PALETTE.length];
  const [,tx] = PALETTE[Math.abs((profile?.full_name||"").charCodeAt(0)||0) % PALETTE.length];
  return (
    <div style={{width:size,height:size,borderRadius:Math.floor(size*0.28),overflow:"hidden",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:Math.floor(size*0.3),color:tx,boxShadow:"0 2px 8px rgba(0,0,0,.1)",flexShrink:0,...style}}>
      {profile?.avatar_url
        ?<img src={profile.avatar_url} alt={profile.full_name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}} />
        :<span>{initials(profile?.full_name||"?")}</span>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH BAR
// ═══════════════════════════════════════════════════════════════════════════════
function SearchBar({sCity,setSCity,sDate,setSDate,searched,onSearch,onReset}) {
  return (
    <div style={{background:"#fff",borderRadius:16,padding:18,boxShadow:"0 2px 16px rgba(0,0,0,.07)",marginBottom:20,border:"1px solid #E2E8D8"}}>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#2E5339",marginBottom:14}}>Où voulez-vous aller ?</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><label style={{display:"block",fontSize:12,fontWeight:800,color:"#666",marginBottom:5}}>Destination</label>
          <select value={sCity} onChange={e=>setSCity(e.target.value)} style={IS()}>
            <option value="">Toutes les villes</option>
            {DESTINATIONS.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label style={{display:"block",fontSize:12,fontWeight:800,color:"#666",marginBottom:5}}>Date</label>
          <input type="date" min={TODAY} value={sDate} onChange={e=>setSDate(e.target.value)} style={IS()} />
        </div>
      </div>
      <button onClick={onSearch} style={{width:"100%",background:"#2E5339",color:"#fff",border:"none",borderRadius:10,padding:"11px",fontWeight:800,fontSize:15}}>Rechercher</button>
      {searched&&<button onClick={onReset} style={{width:"100%",background:"none",border:"none",color:"#7A9A6A",fontWeight:700,fontSize:12,marginTop:8}}>✕ Effacer la recherche</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MICRO-COMPOSANTS
// ═══════════════════════════════════════════════════════════════════════════════
const CHIP_S={default:["#F0F2EC","#555"],date:["#EAF4E0","#2E5339"],time:["#E8F4FD","#1A5276"],return:["#FEF9E7","#9A7D0A"],recur:["#F0EBF8","#6C3483"]};
function Chip({children,accent}){const[bg,col]=CHIP_S[accent]||CHIP_S.default;return<span style={{background:bg,color:col,borderRadius:7,padding:"3px 9px",fontSize:11,fontWeight:800,letterSpacing:.3}}>{children}</span>;}
function Sec({title,children}){return<div style={{marginBottom:20}}><div style={{fontSize:11,fontWeight:900,color:"#4A7C59",textTransform:"uppercase",letterSpacing:1.3,marginBottom:12,paddingBottom:6,borderBottom:"1px solid #E8EDE0"}}>{title}</div><div style={{display:"flex",flexDirection:"column",gap:10}}>{children}</div></div>;}
function Row2({children}){return<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{children}</div>;}
function Fld({label,children,err}){return<div>{label&&<label style={{display:"block",fontSize:12,fontWeight:800,color:err?"#DC2626":"#666",marginBottom:5}}>{label}</label>}{children}{err&&<div style={{fontSize:11,color:"#DC2626",marginTop:4,fontWeight:700}}>⚠ {err}</div>}</div>;}
function FldA({label,children}){return<div><label style={{display:"block",fontSize:12,fontWeight:800,color:"#666",marginBottom:5}}>{label}</label>{children}</div>;}
function IS(err){return{width:"100%",border:`1.5px solid ${err?"#FCA5A5":"#DDE4D0"}`,borderRadius:9,padding:"10px 12px",fontSize:14,color:"#2A2A1E",background:"#FAFCF7",transition:"all .2s"};}
function IA(){return{width:"100%",border:"1.5px solid #DDE4D0",borderRadius:9,padding:"10px 12px",fontSize:14,color:"#2A2A1E",background:"#FAFCF7",transition:"all .2s"};}
function InfoBox({children}){return<div style={{background:"#EAF4E0",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#2E5339",fontWeight:700,marginTop:4}}>{children}</div>;}
function STitle({children,right}){return<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#2E5339"}}>{children}</div>{right}</div>;}
function Empty({label,sub}){return<div style={{textAlign:"center",padding:"56px 0"}}><div style={{fontSize:44,marginBottom:12}}>🍃</div><div style={{fontWeight:800,fontSize:16,color:"#888",marginBottom:6}}>{label}</div><div style={{fontSize:13,color:"#AAA"}}>{sub}</div></div>;}
function Lnk({children,onClick}){return<button onClick={onClick} style={{background:"none",border:"none",color:"#4A7C59",fontWeight:800,fontSize:13,cursor:"pointer",textDecoration:"underline"}}>{children}</button>;}
function Toast({notif}){const colors={ok:["#F0FDF4","#4ADE80","#166534"],warn:["#FEF3C7","#D97706","#92400E"],err:["#FEF2F2","#FECACA","#DC2626"]}[notif.type||"ok"];return<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:colors[0],border:`1.5px solid ${colors[1]}`,borderRadius:12,padding:"11px 22px",color:colors[2],fontWeight:800,fontSize:14,boxShadow:"0 8px 30px rgba(0,0,0,.15)",animation:"toastIn .3s ease",whiteSpace:"nowrap",maxWidth:"92vw"}}>{notif.msg}</div>;}
function Spinner({full,inline}){const s={width:36,height:36,border:"4px solid #E2E8D8",borderTop:"4px solid #2E5339",borderRadius:"50%",animation:"spin .8s linear infinite"};if(full)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}><div style={s}/></div>;return<div style={{display:"flex",justifyContent:"center",padding:"40px 0"}}><div style={s}/></div>;}
