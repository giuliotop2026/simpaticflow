import React, { useState, useEffect } from 'react';
import { Plane, Trophy, Clock, Target, DollarSign, Search, AlertCircle, Sparkles, MapPin } from 'lucide-react';

const SimpaticFlow = () => {
  const [betText, setBetText] = useState('');
  const [matches, setMatches] = useState([]);
  const [planePosition, setPlanePosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [particles, setParticles] = useState([]);

  // Napoli colors
  const napoliBlue = '#003c82';
  const napoliLightBlue = '#12a0d7';
  const napoliGold = '#ffd700';
  const white = '#ffffff';

  const searchMatchData = async (homeTeam, awayTeam) => {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 
      
      // Se non c'è la chiave, usa dati finti per non rompere l'app
      if (!apiKey) {
        console.warn("Manca VITE_GEMINI_API_KEY, uso dati simulati.");
        return {
           homeScore: 0, awayScore: 0, status: "scheduled", startTime: "20:45", minute: 0
        };
      }

      // Endpoint di Gemini 1.5 Flash (Veloce ed Economico/Gratis)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const prompt = `Cerca su Google il risultato live esatto della partita di calcio ${homeTeam} vs ${awayTeam} di oggi.
      Se non è iniziata dammi l'orario. Se è finita dammi il risultato finale.
      
      Rispondi ESCLUSIVAMENTE con questo formato JSON (senza markdown):
      {
        "homeScore": numero (0 se non iniziata),
        "awayScore": numero (0 se non iniziata),
        "status": "live" o "scheduled" o "finished",
        "startTime": "HH:MM",
        "minute": numero (es. 45, o null se non iniziata/finita)
      }`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          // Questo attiva la ricerca su Google per dati freschi!
          tools: [{ google_search: {} }]
        })
      });

      const data = await response.json();
      
      // Parsing della risposta di Gemini
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Pulizia del testo da eventuali blocchi markdown ```json ... ```
      const cleanJson = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      
      return parsed;

    } catch (err) {
      console.error('Errore Gemini:', err);
      // Fallback in caso di errore
      return { homeScore: 0, awayScore: 0, status: 'scheduled', startTime: '--:--' };
    }
  };

  const parseBetSlip = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const parsed = [];
    
    for (let line of lines) {
      const matchPattern = /(.+?)\s*[-vs]+\s*(.+?)(?:\s+[12X]|\s*$)/i;
      const match = line.match(matchPattern);
      
      if (match) {
        let bet = '1';
        if (line.match(/\sX\s/i) || line.toLowerCase().includes('pareggio')) bet = 'X';
        else if (line.match(/\s2\b/i)) bet = '2';
        
        parsed.push({
          id: parsed.length,
          homeTeam: match[1].trim(),
          awayTeam: match[2].trim(),
          bet,
          startTime: '--:--',
          status: 'searching',
          homeScore: null,
          awayScore: null,
          isLive: false,
          minute: null
        });
      }
    }
    return parsed;
  };

  const handleParseBet = async () => {
    setError('');
    const parsed = parseBetSlip(betText);
    if (parsed.length === 0) {
      setError('Nessuna partita trovata. Esempio: "Napoli - Inter 1"');
      return;
    }
    
    setMatches(parsed);
    setPlanePosition(0);
    setLoading(true);

    // Caricamento sequenziale per non colpire il rate limit
    const updatedMatches = [...parsed];
    for (let i = 0; i < parsed.length; i++) {
      const data = await searchMatchData(parsed[i].homeTeam, parsed[i].awayTeam);
      if (data) {
        updatedMatches[i] = { ...updatedMatches[i], ...data, isLive: data.status === 'live' };
        setMatches([...updatedMatches]); // Aggiornamento visivo progressivo
      }
      await new Promise(r => setTimeout(r, 1000)); // 1 secondo di pausa tra le richieste
    }
    setLoading(false);
    createParticles('launch');
  };

  const refreshMatchData = async (index) => {
    const match = matches[index];
    if (!match || match.status === 'finished') return;
    
    const data = await searchMatchData(match.homeTeam, match.awayTeam);
    if (data) {
      setMatches(prev => {
        const updated = [...prev];
        // Effetto Goal se cambia il punteggio
        if (data.homeScore > match.homeScore || data.awayScore > match.awayScore) {
           createParticles('goal');
        }
        updated[index] = { ...updated[index], ...data, isLive: data.status === 'live' };
        return updated;
      });
    }
  };

  const checkBetResult = (match) => {
    if (match.homeScore == null || match.awayScore == null) return 'waiting';
    // Consideriamo il risultato valido per il colore anche se la partita non è finita (per l'emozione!)
    const { homeScore, awayScore, bet } = match;
    const h = Number(homeScore);
    const a = Number(awayScore);
    
    if (bet === '1' && h > a) return 'won';
    if (bet === 'X' && h === a) return 'won';
    if (bet === '2' && a > h) return 'won';
    return 'lost';
  };

  useEffect(() => {
    if (matches.length === 0 || loading) return;
    // Aggiorna ogni 60 secondi per non consumare troppe chiamate API
    const interval = setInterval(() => {
      matches.forEach((m, idx) => {
        if (m.status === 'live' || m.status === 'scheduled') refreshMatchData(idx);
      });
    }, 60000); 
    return () => clearInterval(interval);
  }, [matches, loading]);

  useEffect(() => {
    if (!matches.length) return;
    const wonCount = matches.filter(m => checkBetResult(m) === 'won').length;
    const progress = matches.length ? (wonCount / matches.length) * 100 : 0;
    setPlanePosition(progress);
    if (progress > 0) createParticles('progress');
  }, [matches]);

  const createParticles = (type) => {
    const newParticles = [];
    const count = type === 'goal' ? 40 : 15;
    const color = type === 'goal' ? white : (type === 'win' ? napoliGold : napoliLightBlue);
    
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        vx: (Math.random() - 0.5) * (type==='goal'? 8 : 2),
        vy: (Math.random() - 0.5) * (type==='goal'? 8 : 2),
        life: 100,
        color: color
      });
    }
    setParticles(p => [...p, ...newParticles]);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(p => p.map(part => ({
        ...part,
        x: part.x + part.vx,
        y: part.y + part.vy,
        life: part.life - 3
      })).filter(p => p.life > 0));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const allWon = matches.length > 0 && matches.every(m => checkBetResult(m) === 'won');
  const anyLost = matches.some(m => checkBetResult(m) === 'lost');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--napoli-blue)] via-[var(--napoli-light-blue)] to-slate-900 text-white p-4 overflow-hidden relative" style={{'--napoli-blue': napoliBlue, '--napoli-light-blue': napoliLightBlue}}>
      {/* Background elements */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        {Array.from({length: 20}).map((_, i) => (
          <div key={i} className="absolute w-2 h-2 bg-napoli-gold rounded-full animate-float" style={{
            left: `${Math.random()*100}%`,
            animationDelay: `${Math.random()*2}s`,
            animationDuration: `${3+Math.random()*4}s`
          }} />
        ))}
      </div>
      
      {/* Particles Layer */}
      {particles.map(p => (
        <div key={p.id} className="absolute w-3 h-3 rounded-full pointer-events-none z-50" style={{
          left: `${p.x}%`,
          top: `${p.y}%`,
          background: p.color,
          opacity: p.life/100,
          boxShadow: `0 0 10px ${p.color}`
        }} />
      ))}

      <div className="max-w-6xl mx-auto relative z-10 pt-4">
        {/* Header */}
        <div className="text-center mb-10 relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Sparkles className="w-64 h-64 animate-spin-slow opacity-20 text-napoli-gold" />
          </div>
          <h1 className="text-5xl md:text-8xl font-black mb-2 bg-gradient-to-r from-napoli-gold to-yellow-300 bg-clip-text text-transparent drop-shadow-xl animate-pulse">
            SIMPATICFLOW
          </h1>
          <p className="text-2xl md:text-3xl font-bold mb-4 drop-shadow-md">⚽ LIVE TRACKER ⚽</p>
          <div className="inline-block bg-napoli-gold text-napoli-blue px-4 py-1 rounded-full text-lg font-black animate-bounce">
            FORZA NAPOLI SEMPRE 💙
          </div>
        </div>

        {/* Input Form */}
        {matches.length === 0 && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 md:p-8 mb-8 border-4 border-napoli-gold shadow-2xl max-w-2xl mx-auto">
            <h2 className="text-2xl font-black mb-4 flex items-center justify-center gap-3 text-napoli-gold">
              <MapPin className="w-6 h-6" />
              INSERISCI LA BOLLETTA
            </h2>
            <textarea
              className="w-full h-48 bg-black/20 text-white p-4 rounded-xl border-2 border-napoli-light-blue focus:border-napoli-gold outline-none font-mono text-lg resize-none placeholder-gray-400"
              placeholder={`Es: 
Napoli - Juventus 1
Milan - Inter X
Roma - Lazio 2`}
              value={betText}
              onChange={(e) => setBetText(e.target.value)}
              disabled={loading}
            />
            {error && <div className="mt-4 p-3 bg-red-500/50 border border-red-400 rounded-lg flex items-center gap-2 font-bold"><AlertCircle className="w-5 h-5"/> {error}</div>}
            
            <button
              onClick={handleParseBet}
              disabled={loading}
              className="mt-6 w-full bg-gradient-to-r from-napoli-gold to-yellow-500 hover:from-yellow-400 hover:to-napoli-gold text-napoli-blue font-black py-4 rounded-xl text-xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {loading ? <Search className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              {loading ? 'CERCO RISULTATI LIVE...' : 'CARICA SCHEDINA'}
            </button>
          </div>
        )}

        {/* Results Area */}
        {matches.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Status Bar / Flight Path */}
            <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 border-2 border-napoli-light-blue mb-8 shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 text-napoli-gold font-black text-xl">
                <Plane className="w-6 h-6" /> ROTTA VERSO LA CASSA
              </div>
              
              <div className="relative h-12 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
                {/* Progress Bar */}
                <div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-1000 ease-out"
                  style={{ width: `${planePosition}%` }}
                />
                
                {/* Checkpoints */}
                {matches.map((_, idx) => (
                   <div key={idx} className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-white/30" style={{ left: `${((idx + 1) / matches.length) * 100}%` }} />
                ))}

                {/* Plane Icon */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 transition-all duration-1000 ease-out z-10"
                  style={{ left: `calc(${planePosition}% - 20px)` }}
                >
                  <Plane className={`w-8 h-8 text-white drop-shadow-lg transform rotate-45 ${planePosition === 100 ? 'animate-bounce' : ''}`} />
                </div>
              </div>

              {allWon && (
                <div className="mt-4 text-center bg-green-500/20 border border-green-500 rounded-lg p-2 animate-pulse">
                  <Trophy className="inline w-6 h-6 text-napoli-gold mr-2" />
                  <span className="font-black text-xl text-green-400">TUTTE PRESE! COMPLIMENTI!</span>
                </div>
              )}
            </div>

            {/* Match Cards */}
            <div className="grid gap-4">
              {matches.map((match, idx) => {
                const result = checkBetResult(match);
                return (
                  <div key={idx} className={`relative overflow-hidden bg-white/10 backdrop-blur-md rounded-xl p-4 border-l-8 shadow-lg transition-all hover:translate-x-1 ${
                    result === 'won' ? 'border-l-green-400 bg-green-900/20' :
                    result === 'lost' ? 'border-l-red-500 bg-red-900/20' :
                    'border-l-napoli-gold'
                  }`}>
                    <div className="flex justify-between items-center relative z-10">
                      
                      {/* Teams & Score */}
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-lg md:text-xl">{match.homeTeam}</span>
                          <span className={`font-mono font-black text-2xl md:text-3xl ${match.isLive ? 'text-yellow-400' : 'text-white'}`}>
                            {match.homeScore !== null ? match.homeScore : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-lg md:text-xl">{match.awayTeam}</span>
                          <span className={`font-mono font-black text-2xl md:text-3xl ${match.isLive ? 'text-yellow-400' : 'text-white'}`}>
                            {match.awayScore !== null ? match.awayScore : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Info & Status */}
                      <div className="ml-4 pl-4 border-l border-white/10 text-right min-w-[80px]">
                        <div className="text-xs text-gray-300 mb-1 flex items-center justify-end gap-1">
                          {match.isLive && <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"/>}
                          {match.status === 'finished' ? 'FINITA' : (match.isLive ? `${match.minute}'` : match.startTime)}
                        </div>
                        <div className="text-sm text-gray-400">Punti su</div>
                        <div className="text-2xl font-black text-napoli-gold">{match.bet}</div>
                        
                        {/* Status Icon */}
                        <div className="mt-2 flex justify-end">
                           {result === 'won' && <div className="bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">PRESA</div>}
                           {result === 'lost' && <div className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">PERSA</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="mt-8 flex gap-3">
               <button 
                 onClick={() => {
                   setMatches([]);
                   setBetText('');
                   setPlanePosition(0);
                 }}
                 className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
               >
                 Nuova Schedina
               </button>
               <button 
                 onClick={() => matches.forEach((_, i) => refreshMatchData(i))}
                 className="flex-1 bg-napoli-light-blue hover:bg-blue-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
               >
                 <Search className="w-4 h-4" /> Aggiorna Dati
               </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes float { 0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)} }
        @keyframes spin-slow { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-spin-slow { animation: spin-slow 20s linear infinite; }
      `}</style>
    </div>
  );
};

export default SimpaticFlow;
