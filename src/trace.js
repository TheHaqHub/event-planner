/**
 * Pretty terminal trace printer.
 * Formats every model call, decisions, plan summary, checks, and total token count.
 */

export function formatTrace(state) {
  const lines = [];
  const separator = '='.repeat(70);
  const subSeparator = '-'.repeat(70);

  lines.push(separator);
  lines.push('               MIND TO MACHINE HACKATHON: AGENT TRACE');
  lines.push(separator);

  // 1. Model Calls Trace
  lines.push('\n[1] MODEL EXECUTION TRACE:');
  lines.push(subSeparator);

  const traceEntries = state.trace || [];
  let calculatedTotalTokens = 0;

  if (traceEntries.length === 0) {
    lines.push('  No model calls recorded.');
  } else {
    for (const entry of traceEntries) {
      lines.push(`CALL #${entry.n}`);
      lines.push(`  Model:     ${entry.model || 'unknown'}`);
      lines.push(`  Area:      [${entry.area || 'reading'}]`);

      const inReported = entry.tokensIn !== null && entry.tokensIn !== undefined;
      const outReported = entry.tokensOut !== null && entry.tokensOut !== undefined;

      const inStr = inReported ? entry.tokensIn : 'not reported';
      const outStr = outReported ? entry.tokensOut : 'not reported';

      if (inReported) calculatedTotalTokens += Number(entry.tokensIn);
      if (outReported) calculatedTotalTokens += Number(entry.tokensOut);

      const callTotal = (inReported && outReported) 
        ? (Number(entry.tokensIn) + Number(entry.tokensOut)) 
        : ((inReported ? Number(entry.tokensIn) : 0) + (outReported ? Number(entry.tokensOut) : 0));

      lines.push(`  Tokens In: ${inStr}  |  Tokens Out: ${outStr}  |  Call Total: ${inReported || outReported ? callTotal : 'not reported'}`);
      
      const inputStr = typeof entry.input === 'object' ? JSON.stringify(entry.input) : String(entry.input || '');
      const outputStr = typeof entry.output === 'object' ? JSON.stringify(entry.output) : String(entry.output || '');
      
      lines.push(`  Input:     ${inputStr.length > 200 ? inputStr.slice(0, 197) + '...' : inputStr}`);
      lines.push(`  Output:    ${outputStr.length > 200 ? outputStr.slice(0, 197) + '...' : outputStr}`);
      lines.push(subSeparator);
    }
  }

  // 2. Decisions & Conflict Resolutions
  lines.push('\n[2] DECISIONS & CONFLICT RESOLUTIONS:');
  lines.push(subSeparator);

  const decisions = state.decisions || [];
  if (decisions.length === 0) {
    lines.push('  None recorded.');
  } else {
    for (const d of decisions) {
      lines.push(`  * ${d}`);
    }
  }

  // 3. Rejected Messages
  if (state.rejected && state.rejected.length > 0) {
    lines.push('\n[REJECTED MESSAGES]:');
    for (const r of state.rejected) {
      lines.push(`  ! Message #${r.messageId} REJECTED: ${r.reason}`);
      if (r.text) {
        lines.push(`    Content: "${r.text.length > 100 ? r.text.slice(0, 97) + '...' : r.text}"`);
      }
    }
    lines.push(subSeparator);
  }

  // 4. Ignored / Superseded
  if (state.ignored && state.ignored.length > 0) {
    lines.push('\n[IGNORED / SUPERSEDED ITEMS]:');
    for (const ig of state.ignored) {
      lines.push(`  - Message #${ig.messageId}: ${ig.reason}`);
    }
    lines.push(subSeparator);
  }

  // 5. Plan Summary
  lines.push('\n[3] PLAN SUMMARY:');
  lines.push(subSeparator);
  const plan = state.plan || {};

  // Venue
  const v = plan.venue || {};
  lines.push(`  VENUE:    ${v.name || 'None'} (Capacity: ${v.capacity || 0}, Cost: Rs ${(v.cost || 0).toLocaleString()})`);
  if (v.features && v.features.length > 0) {
    lines.push(`            Features: ${v.features.join(', ')}`);
  }

  // Schedule
  lines.push(`  SCHEDULE: 4-Hour Timeline`);
  if (plan.schedule && plan.schedule.length > 0) {
    for (const s of plan.schedule) {
      lines.push(`    ${s.start} - ${s.end}  ${s.title} (${s.durationMin}m)`);
    }
  }

  // Food
  const f = plan.food || {};
  lines.push(`  FOOD:     ${f.attendees || 0} attendees × Rs ${(f.unitPrice || 0).toLocaleString()} (${f.type || 'standard'} lunch box) = Rs ${(f.totalCost || 0).toLocaleString()}`);

  // Judging
  const j = plan.judging || {};
  lines.push(`  JUDGING:  ${j.judgesNeeded || 0} judges needed (${j.judgesConfirmed || 0} confirmed) × Rs ${(j.honorariumPerJudge || 0).toLocaleString()} = Rs ${(j.totalCost || 0).toLocaleString()}`);
  lines.push(`            ${j.minutesPerTeam || 15} mins/team, max ${j.maxTeamsPerJudge || 3} teams/judge (${j.slotsCount || 0} team slots assigned)`);

  // Budget
  const b = plan.budget || {};
  lines.push(`  BUDGET:   Total Rs ${(b.total || 0).toLocaleString()} / Limit Rs ${(b.limit || 0).toLocaleString()} [${b.ok ? 'OK' : 'EXCEEDED'}]`);
  if (b.lines && b.lines.length > 0) {
    for (const line of b.lines) {
      lines.push(`    - ${line.item.padEnd(45)}: Rs ${line.amount.toLocaleString()}`);
    }
  }

  // Notes
  if (plan.notes && plan.notes.length > 0) {
    lines.push(`  NOTES:`);
    for (const n of plan.notes) {
      lines.push(`    * ${n}`);
    }
  }

  // 6. Mandatory Checks
  lines.push('\n[4] SYSTEM VERIFICATION CHECKS:');
  lines.push(subSeparator);
  const checks = state.checks || [];
  let allOk = true;
  for (const c of checks) {
    const status = c.ok ? '[PASS]' : '[FAIL]';
    if (!c.ok) allOk = false;
    lines.push(`  ${status}  ${c.name.padEnd(20)} : ${c.detail}`);
  }
  lines.push(`  OVERALL STATUS: ${allOk ? 'ALL CHECKS PASSED (VALID PLAN)' : 'FAILED CHECKS DETECTED'}`);

  // 7. Total Tokens
  lines.push(subSeparator);
  const finalTotal = state.totalTokens !== undefined ? state.totalTokens : calculatedTotalTokens;
  lines.push(`TOTAL TOKENS: ${finalTotal}`);
  lines.push(separator);

  return lines.join('\n');
}

export function printTrace(state) {
  const text = formatTrace(state);
  console.log(text);
  return text;
}
