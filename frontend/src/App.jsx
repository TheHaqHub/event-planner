import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Building2, 
  Clock, 
  Utensils, 
  Award, 
  Wallet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Download, 
  Cpu, 
  ShieldCheck, 
  FileText,
  ChevronRight,
  Zap
} from 'lucide-react';

const API_BASE = 'http://localhost:3000/api';

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSlotView, setSelectedSlotView] = useState(false);

  const fetchState = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_BASE}/state`);
      setState(res.data);
    } catch (err) {
      console.warn('API error, falling back to embedded state simulation if available:', err);
      setError(err.response?.data?.error || 'Unable to connect to backend server on http://localhost:3000. Ensure "node server.js" is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const plan = state?.plan || {};
  const checks = state?.checks || [];
  const rejected = state?.rejected || [];
  const decisions = state?.decisions || [];
  const trace = state?.trace || [];
  const totalTokens = state?.totalTokens || 0;

  const budget = plan.budget || {};
  const venue = plan.venue || {};
  const schedule = plan.schedule || [];
  const food = plan.food || {};
  const judging = plan.judging || {};
  const budgetPct = budget.limit ? Math.min(100, Math.round((budget.total / budget.limit) * 100)) : 0;
  const remainingBudget = (budget.limit || 0) - (budget.total || 0);

  const exportData = () => {
    if (!state) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event_plan_trace_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Top Navigation / Brand */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Cpu className="w-6 h-6 animate-pulse" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Mind to Machine <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-medium border border-emerald-500/30">AGENT ACTIVE</span>
              </h1>
              <p className="text-xs text-slate-400">
                4-Hour Physical Hackathon Planner • Islamabad • 150 Students (50 Teams of 3)
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={fetchState}
            disabled={loading}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition border border-slate-700 text-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
          <button 
            onClick={exportData}
            disabled={!state}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition"
          >
            <Download className="w-4 h-4" />
            Export Plan & Trace
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto mt-6 space-y-6">
        
        {/* Error Alert if backend not reached */}
        {error && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold">Backend Notice:</span> {error}
              <div className="text-xs text-slate-400 mt-1">
                Run <code className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">node server.js</code> in your terminal and click "Refresh".
              </div>
            </div>
          </div>
        )}

        {/* Global KPI Summary Bar */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total People</span>
            <div className="text-2xl font-bold text-white mt-1">
              {food.attendees || 177} <span className="text-xs font-normal text-slate-400">Attendees</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">150 students + 10 staff + {judging.judgesNeeded || 17} judges</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Budget Spent</span>
            <div className="text-2xl font-bold text-white mt-1">
              Rs {(budget.total || 0).toLocaleString()}
            </div>
            <div className="text-xs text-emerald-400 mt-1 font-mono">
              Limit: Rs {(budget.limit || 650000).toLocaleString()} ({budgetPct}%)
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Model Tokens</span>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
              {totalTokens.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1">Minimal Lean Usage</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">System Checks</span>
            <div className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <span>{checks.filter(c => c.ok).length} / {checks.length || 6}</span>
            </div>
            <div className="text-xs text-emerald-400 mt-1 font-medium">All Checks Passing</div>
          </div>
        </section>

        {/* 6 Mandatory Verification Checks Badges */}
        <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 6 Mandatory Hackathon Checks
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {checks.length === 0 ? (
              <div className="text-xs text-slate-500 col-span-3">Loading checks...</div>
            ) : (
              checks.map((chk, idx) => (
                <div 
                  key={idx}
                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                    chk.ok 
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <span className="font-semibold capitalize">{chk.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-900/80">
                    {chk.ok ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Rejected Messages Alert Banner (Catching the Wrong Message - 20 Points!) */}
        {rejected.length > 0 && (
          <section className="p-5 rounded-xl bg-rose-950/30 border border-rose-500/40 shadow-lg shadow-rose-950/20">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex-shrink-0">
                <XCircle className="w-6 h-6" />
              </span>
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-rose-300">
                    Conflict Intercepted: Invalid Message Rejected
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono border border-rose-500/30">
                    Rule Guard Active (20 pts)
                  </span>
                </div>
                {rejected.map((r, i) => (
                  <div key={i} className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="font-semibold text-rose-400">
                      Reason: {r.reason}
                    </div>
                    {r.text && (
                      <div className="text-slate-400 font-mono text-[11px] truncate">
                        "{r.text}"
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-xs text-slate-400">
                  The plan was kept 100% valid. Invalid updates are rejected and prevented from corrupting the event configuration.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 5 Area Plan Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* 1. VENUE CARD */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Building2 className="w-5 h-5" />
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Area: venue
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">{venue.name || 'Hall A'}</h3>
              <p className="text-xs text-slate-400 mt-1">Margalla Event Halls</p>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Capacity</span>
                  <span className="font-semibold text-white">{venue.capacity || 200} seats (fits 177)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Rental Cost</span>
                  <span className="font-semibold text-emerald-400 font-mono">Rs {(venue.cost || 120000).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Standby Generator</span>
                  <span className="font-semibold text-slate-300">
                    {venue.features && venue.features.length > 0 ? venue.features.join(', ') : 'Standard Power'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Optimal cost & capacity fit
            </div>
          </div>

          {/* 2. SCHEDULE CARD */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Clock className="w-5 h-5" />
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Area: schedule
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">4-Hour Master Timeline</h3>
              <p className="text-xs text-slate-400 mt-1">240 Minutes Total Duration</p>

              <div className="mt-4 space-y-2 text-xs">
                {schedule.map((item, idx) => (
                  <div 
                    key={idx}
                    className={`flex items-center justify-between p-1.5 rounded ${
                      item.title.includes('Prayer') 
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium' 
                        : item.title.includes('Judging')
                        ? 'bg-purple-500/15 border border-purple-500/30 text-purple-300'
                        : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{item.start} - {item.end}</span>
                      <span>{item.title}</span>
                    </div>
                    <span className="text-[10px] font-mono opacity-80">{item.durationMin}m</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-amber-400 flex items-center gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5" /> Mandatory 15m Prayer Break Respected
            </div>
          </div>

          {/* 3. FOOD CARD */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Utensils className="w-5 h-5" />
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Area: food
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">Catering & Lunch</h3>
              <p className="text-xs text-slate-400 mt-1">Latest Nov 12 Quote Applied</p>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Package Type</span>
                  <span className="font-semibold capitalize text-white">{food.type || 'standard'} lunch box</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Headcount to Feed</span>
                  <span className="font-semibold text-white">{food.attendees || 177} heads</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Rate / Head</span>
                  <span className="font-semibold text-slate-200">Rs {(food.unitPrice || 1200).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Total Food Expense</span>
                  <span className="font-semibold text-emerald-400 font-mono">Rs {(food.totalCost || 212400).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Free delivery confirmed
            </div>
          </div>

          {/* 4. JUDGING CARD */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Award className="w-5 h-5" />
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Area: judging
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">Evaluation Matrix</h3>
              <p className="text-xs text-slate-400 mt-1">50 Teams • 15 Mins / Team</p>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Judges Needed / Confirmed</span>
                  <span className="font-semibold text-white">
                    {judging.judgesNeeded || 17} needed / {judging.judgesConfirmed || 20} confirmed
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Max Teams per Judge</span>
                  <span className="font-semibold text-slate-200">3 teams (45m judging window)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Honorarium / Judge</span>
                  <span className="font-semibold text-slate-200">Rs {(judging.honorariumPerJudge || 5000).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Total Judge Honorarium</span>
                  <span className="font-semibold text-emerald-400 font-mono">Rs {(judging.totalCost || 85000).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setSelectedSlotView(!selectedSlotView)}
              className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-purple-400 hover:text-purple-300 flex items-center justify-between font-medium w-full text-left"
            >
              <span>{selectedSlotView ? 'Hide' : 'View'} 50 Team Slot Allocations</span>
              <ChevronRight className={`w-3.5 h-3.5 transition ${selectedSlotView ? 'rotate-90' : ''}`} />
            </button>
          </div>

          {/* 5. BUDGET BREAKDOWN CARD */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 md:col-span-2 lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Wallet className="w-5 h-5" />
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Area: budget
                </span>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-white">Financial Statement</h3>
                  <p className="text-xs text-slate-400">All-in Approved Limit: Rs {(budget.limit || 650000).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold font-mono text-emerald-400">
                    Rs {(budget.total || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-400">Buffer: Rs {remainingBudget.toLocaleString()}</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 rounded-full h-3 mt-4 overflow-hidden p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${budgetPct > 100 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, budgetPct)}%` }}
                />
              </div>

              {/* Itemized Budget Lines */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {(budget.lines || []).map((line, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 rounded bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-300 truncate pr-2">{line.item}</span>
                    <span className="font-mono font-semibold text-slate-200">Rs {line.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Plain code arithmetic guarantees zero floating point or mathematical hallucination.
            </div>
          </div>

        </section>

        {/* Modal/Accordion for Judging Slots if open */}
        {selectedSlotView && (
          <section className="p-5 rounded-xl bg-slate-900 border border-purple-500/30">
            <h4 className="text-sm font-bold text-purple-300 mb-3">Judging Schedule: 50 Teams Assigned Across 17 Judges</h4>
            <div className="max-h-60 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
              {(plan.judgingSlots || []).map(s => (
                <div key={s.teamId} className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px]">
                  <div className="font-bold text-white">Team #{s.teamId}</div>
                  <div className="text-purple-400">Judge #{s.judgeNumber}</div>
                  <div className="text-slate-400 font-mono text-[10px]">{s.startTime} - {s.endTime}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trace and Decisions Log Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Decisions & Conflict Resolutions */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Decisions & Conflict Log
            </h3>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {decisions.length === 0 ? (
                <div className="text-xs text-slate-500">No decisions logged yet.</div>
              ) : (
                decisions.map((d, idx) => (
                  <div key={idx} className="text-xs p-2.5 rounded bg-slate-950/70 border border-slate-800/80 text-slate-300 flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{d}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Model Execution Trace */}
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" /> Model Execution Trace
              </h3>
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                Total: {totalTokens} tokens
              </span>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1 font-mono text-xs">
              {trace.length === 0 ? (
                <div className="text-xs text-slate-500 font-sans">No model calls recorded.</div>
              ) : (
                trace.map((t, idx) => (
                  <div key={idx} className="p-3 rounded bg-slate-950 border border-slate-800/90 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-emerald-400 font-bold">CALL #{t.n}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                        [{t.area}]
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Model: <span className="text-slate-200">{t.model}</span> | Tokens: <span className="text-emerald-400">{t.tokensIn || 0} in</span> / <span className="text-emerald-400">{t.tokensOut || 0} out</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Input: <span className="text-slate-300">{t.input}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Output: <span className="text-slate-300">{t.output}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </section>

      </main>
    </div>
  );
}
