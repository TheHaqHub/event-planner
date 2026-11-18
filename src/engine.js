/**
 * Pure functions for event planning engine.
 * No I/O. Reads structured facts and produces plan, checks, decisions, ignored, and rejected.
 */

// Registry mapping constraint keywords to handler functions (Rule G)
export const CONSTRAINT_REGISTRY = {
  generator: (constraint, ctx) => {
    ctx.venueConstraints.push({
      type: 'feature',
      requiredFeature: 'generator',
      description: constraint.rule
    });
    return true;
  },
  prayer: (constraint, ctx) => {
    const match = constraint.rule.match(/(\d+)\s*min/i);
    if (match) {
      ctx.overrides.prayer_break_min = parseInt(match[1], 10);
    }
    return true;
  },
  budget: (constraint, ctx) => {
    const match = constraint.rule.match(/(?:rs\.?|inr|\$)?\s*([\d,]+)/i);
    if (match) {
      ctx.overrides.budget_total = parseInt(match[1].replace(/,/g, ''), 10);
    }
    return true;
  }
};

/**
 * Parses message date string assuming year 2026.
 * @param {string} dateStr e.g. "9 Nov"
 * @returns {number} timestamp
 */
export function parseMessageDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const clean = dateStr.trim();
  const parsed = new Date(`${clean} 2026 UTC`);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Generates unique key for deduplication and supersede comparison.
 * Accepts both fact.k and fact.kind.
 * @param {object} fact 
 * @returns {string|null}
 */
export function getFactKey(fact) {
  if (!fact) return null;
  const kind = fact.k || fact.kind;
  if (!kind) return null;

  switch (kind) {
    case 'param':
      return `param:${fact.name}`;
    case 'venue':
      return `venue:${(fact.name || '').trim().toLowerCase()}`;
    case 'price':
      return `price:${(fact.item || '').trim().toLowerCase()}`;
    case 'expense':
      return `expense:${(fact.item || '').trim().toLowerCase()}`;
    default:
      return null;
  }
}

/**
 * Builds plan and runs verification checks given messages and facts.
 * 
 * @param {Array} messages - List of message objects [{id, sender, date, relevant, reason, facts, isNewUpdate}]
 * @param {object} [existingPlan] - Optional previous plan state
 * @returns {object} { plan, checks, ignored, decisions, notes, feed, claims }
 */
export function buildPlan(messages = [], existingPlan = null) {
  const ignored = [];
  const decisions = [];
  const notes = [];
  const activeFactsByKey = new Map();
  const constraints = [];
  const claims = [];

  // Index messages by id for fast lookup
  const messageMap = new Map();
  for (const msg of messages) {
    messageMap.set(msg.id, msg);
  }

  // 1. Process messages and collect facts
  for (const msg of messages) {
    // Rule B: irrelevant messages
    if (msg.relevant === false) {
      ignored.push({
        messageId: msg.id,
        reason: msg.reason || 'Irrelevant message'
      });
      decisions.push(`Message #${msg.id} ignored: ${msg.reason || 'Irrelevant message'}`);
      continue;
    }

    const facts = Array.isArray(msg.facts) ? msg.facts : [];
    for (const fact of facts) {
      const kind = fact.k || fact.kind;
      const factWithMeta = { 
        ...fact, 
        k: kind, 
        kind: kind, 
        messageId: msg.id, 
        dateStr: msg.date,
        isNewUpdate: !!msg.isNewUpdate
      };

      // Rule C: kind "request" is not approved -> never added to budget
      if (kind === 'request') {
        ignored.push({
          messageId: msg.id,
          reason: 'request not approved'
        });
        decisions.push(`Request for '${fact.item}' (Rs ${fact.amount || 0}) from message #${msg.id} ignored: request not approved`);
        continue;
      }

      if (kind === 'constraint') {
        constraints.push(factWithMeta);
        continue;
      }

      if (kind === 'claim') {
        claims.push(factWithMeta);
        continue;
      }

      // Check if this fact can supersede or be superseded
      const key = getFactKey(factWithMeta);
      if (key) {
        if (!activeFactsByKey.has(key)) {
          activeFactsByKey.set(key, factWithMeta);
        } else {
          // Supersede logic (Rule A & Rule 5: New message = Newest in update)
          const existing = activeFactsByKey.get(key);
          let winner = null;
          let loser = null;

          // Rule 5: In an update run, any new message is treated as newer than everything in state
          if (factWithMeta.isNewUpdate && !existing.isNewUpdate) {
            winner = factWithMeta;
            loser = existing;
          } else if (existing.isNewUpdate && !factWithMeta.isNewUpdate) {
            winner = existing;
            loser = factWithMeta;
          } else {
            const existingDate = parseMessageDate(existing.dateStr);
            const newDate = parseMessageDate(factWithMeta.dateStr);

            if (newDate > existingDate) {
              winner = factWithMeta;
              loser = existing;
            } else if (newDate < existingDate) {
              winner = existing;
              loser = factWithMeta;
            } else {
              // Same date: higher message id wins
              if (factWithMeta.messageId >= existing.messageId) {
                winner = factWithMeta;
                loser = existing;
              } else {
                winner = existing;
                loser = factWithMeta;
              }
            }
          }

          activeFactsByKey.set(key, winner);
          ignored.push({
            messageId: loser.messageId,
            reason: `superseded by message #${winner.messageId}`
          });
          decisions.push(`Superseded ${loser.kind} '${key}' from message #${loser.messageId} by message #${winner.messageId}`);
        }
      }
    }
  }

  // 2. Extract baseline parameters
  const getParam = (name, fallback = 0) => {
    const f = activeFactsByKey.get(`param:${name}`);
    if (f && f.value !== undefined) {
      const n = Number(f.value);
      return isNaN(n) ? f.value : n;
    }
    return fallback;
  };

  const headcount_students = getParam('headcount_students', 0);
  const team_size = getParam('team_size', 3);
  const duration_hours = getParam('duration_hours', 4);
  let budget_total = getParam('budget_total', 0);
  const staff_count = getParam('staff_count', 0);
  let prayer_break_min = getParam('prayer_break_min', 15);
  const judge_minutes_per_team = getParam('judge_minutes_per_team', 15);
  const judge_max_teams = getParam('judge_max_teams', 3);
  const judges_confirmed = getParam('judges_confirmed', 0);
  const honorarium = getParam('honorarium', 0);

  // 3. Process constraints through registry (Rule G)
  const ctx = {
    venueConstraints: [],
    overrides: {}
  };

  for (const c of constraints) {
    let handled = false;
    const ruleLower = (c.rule || '').toLowerCase();
    for (const [kw, handler] of Object.entries(CONSTRAINT_REGISTRY)) {
      if (ruleLower.includes(kw)) {
        handler(c, ctx);
        handled = true;
        break;
      }
    }
    if (!handled) {
      notes.push(`unhandled constraint: ${c.rule || JSON.stringify(c)}`);
      decisions.push(`Unhandled constraint noted: ${c.rule}`);
    }
  }

  if (ctx.overrides.prayer_break_min !== undefined) {
    prayer_break_min = ctx.overrides.prayer_break_min;
  }
  if (ctx.overrides.budget_total !== undefined) {
    budget_total = ctx.overrides.budget_total;
  }

  // 4. Compute arithmetic
  const teams = team_size > 0 ? Math.ceil(headcount_students / team_size) : 0;
  const judges_needed = judge_max_teams > 0 ? Math.ceil(teams / judge_max_teams) : 0;
  const feed = headcount_students + staff_count + judges_needed;

  decisions.push(`Calculated attendees: ${headcount_students} students (${teams} teams of ${team_size}) + ${staff_count} staff + ${judges_needed} judges needed = ${feed} to feed`);

  // 5. Select Venue
  const venues = [];
  for (const [key, fact] of activeFactsByKey.entries()) {
    if (key.startsWith('venue:')) {
      venues.push(fact);
    }
  }

  const eligibleVenues = venues.filter(v => {
    if (v.capacity < feed) return false;
    for (const vc of ctx.venueConstraints) {
      if (vc.type === 'feature') {
        const hasFeature = Array.isArray(v.features) &&
          v.features.some(f => f.toLowerCase().includes(vc.requiredFeature));
        if (!hasFeature) return false;
      }
    }
    return true;
  });

  let selectedVenue = null;
  if (eligibleVenues.length > 0) {
    eligibleVenues.sort((a, b) => a.cost - b.cost);
    selectedVenue = eligibleVenues[0];
    decisions.push(`Selected venue: ${selectedVenue.name} (Capacity ${selectedVenue.capacity}, Cost Rs ${selectedVenue.cost})`);
  } else if (venues.length > 0) {
    venues.sort((a, b) => b.capacity - a.capacity);
    selectedVenue = venues[0];
  }

  // 6. Food pricing
  let standardPrice = null;
  let basicPrice = null;

  for (const [key, fact] of activeFactsByKey.entries()) {
    if (key.startsWith('price:')) {
      const itemLower = (fact.item || '').toLowerCase();
      if (itemLower.includes('basic')) {
        basicPrice = fact.amount;
      } else if (itemLower.includes('standard') || itemLower.includes('lunch')) {
        standardPrice = fact.amount;
      }
    }
  }

  if (standardPrice === null && basicPrice !== null) standardPrice = basicPrice;
  if (basicPrice === null && standardPrice !== null) basicPrice = standardPrice;

  let chosenFoodType = 'standard';
  let unitFoodPrice = standardPrice || 0;
  let foodTotalCost = unitFoodPrice * feed;

  // 7. Judge cost
  const judgeCost = judges_needed * honorarium;

  // 8. Fixed and other expenses
  const expenseLines = [];
  let otherExpensesTotal = 0;
  for (const [key, fact] of activeFactsByKey.entries()) {
    if (key.startsWith('expense:')) {
      expenseLines.push({
        item: fact.item,
        amount: Number(fact.amount) || 0
      });
      otherExpensesTotal += Number(fact.amount) || 0;
    }
  }

  // 9. Initial Budget Calculation & Basic Food Downgrade Rule
  const venueCost = selectedVenue ? selectedVenue.cost : 0;
  let initialTotalBudget = venueCost + foodTotalCost + judgeCost + otherExpensesTotal;

  if (initialTotalBudget > budget_total && basicPrice !== null && basicPrice < unitFoodPrice) {
    chosenFoodType = 'basic';
    unitFoodPrice = basicPrice;
    foodTotalCost = unitFoodPrice * feed;
    decisions.push(`Budget optimization: Switched to basic lunch box (Rs ${unitFoodPrice}/head) to save cost.`);
  }

  const finalBudgetLines = [
    { item: `Venue: ${selectedVenue ? selectedVenue.name : 'None'}`, amount: venueCost },
    { item: `Food: ${chosenFoodType} lunch box (${feed} × Rs ${unitFoodPrice})`, amount: foodTotalCost },
    { item: `Judges honorarium (${judges_needed} × Rs ${honorarium})`, amount: judgeCost },
    ...expenseLines
  ];

  const finalBudgetTotal = finalBudgetLines.reduce((sum, line) => sum + line.amount, 0);
  const budgetOk = finalBudgetTotal <= budget_total && budget_total > 0;

  // 10. Schedule building
  const totalMinutes = duration_hours * 60;
  const judgingWindowMinutes = judge_max_teams * judge_minutes_per_team;
  const fixedNonBuildMinutes = 15 + 30 + prayer_break_min + judgingWindowMinutes + 15;
  const buildMinutes = totalMinutes - fixedNonBuildMinutes;

  const formatClockTime = (minsFromStart) => {
    const baseHour = 10;
    const h = baseHour + Math.floor(minsFromStart / 60);
    const m = minsFromStart % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}`;
  };

  const schedule = [];
  let currentMin = 0;

  // 1. Kickoff (15 min)
  schedule.push({
    start: formatClockTime(currentMin),
    end: formatClockTime(currentMin + 15),
    durationMin: 15,
    title: 'Check-in & Kickoff'
  });
  currentMin += 15;

  // 2. Build time
  const safeBuildMin = Math.max(0, buildMinutes);
  schedule.push({
    start: formatClockTime(currentMin),
    end: formatClockTime(currentMin + safeBuildMin),
    durationMin: safeBuildMin,
    title: 'Hacking & Development'
  });
  currentMin += safeBuildMin;

  // 3. Lunch (30 min)
  schedule.push({
    start: formatClockTime(currentMin),
    end: formatClockTime(currentMin + 30),
    durationMin: 30,
    title: 'Lunch Break'
  });
  currentMin += 30;

  // 4. Prayer Break
  schedule.push({
    start: formatClockTime(currentMin),
    end: formatClockTime(currentMin + prayer_break_min),
    durationMin: prayer_break_min,
    title: 'Prayer Break'
  });
  currentMin += prayer_break_min;

  // 5. Judging Window
  const judgingStartMin = currentMin;
  schedule.push({
    start: formatClockTime(currentMin),
    end: formatClockTime(currentMin + judgingWindowMinutes),
    durationMin: judgingWindowMinutes,
    title: 'Judging Sessions'
  });
  currentMin += judgingWindowMinutes;

  // 6. Closing (15 min)
  schedule.push({
    start: formatClockTime(currentMin),
    end: formatClockTime(currentMin + 15),
    durationMin: 15,
    title: 'Closing Ceremony & Awards'
  });
  currentMin += 15;

  const judgingSlots = [];
  if (teams > 0 && judges_needed > 0) {
    for (let t = 0; t < teams; t++) {
      const judgeIdx = (t % judges_needed) + 1;
      const slotIdx = Math.floor(t / judges_needed);
      const slotStart = judgingStartMin + slotIdx * judge_minutes_per_team;
      const slotEnd = slotStart + judge_minutes_per_team;
      judgingSlots.push({
        teamId: t + 1,
        judgeNumber: judgeIdx,
        slotNumber: slotIdx + 1,
        startTime: formatClockTime(slotStart),
        endTime: formatClockTime(slotEnd)
      });
    }
  }

  const plan = {
    venue: selectedVenue ? {
      name: selectedVenue.name,
      capacity: selectedVenue.capacity,
      cost: selectedVenue.cost,
      features: selectedVenue.features || []
    } : {},
    schedule,
    food: {
      type: chosenFoodType,
      unitPrice: unitFoodPrice,
      attendees: feed,
      totalCost: foodTotalCost
    },
    judging: {
      judgesNeeded: judges_needed,
      judgesConfirmed: judges_confirmed,
      honorariumPerJudge: honorarium,
      totalCost: judgeCost,
      minutesPerTeam: judge_minutes_per_team,
      maxTeamsPerJudge: judge_max_teams,
      slotsCount: judgingSlots.length
    },
    budget: {
      lines: finalBudgetLines,
      total: finalBudgetTotal,
      limit: budget_total,
      ok: budgetOk
    },
    judgingSlots,
    notes
  };

  const checks = [
    {
      name: 'correct figures',
      ok: headcount_students > 0 && team_size > 0 && duration_hours > 0 &&
          budget_total > 0 && staff_count >= 0 && prayer_break_min >= 0 &&
          judge_minutes_per_team > 0 && judge_max_teams > 0 && judges_confirmed >= 0,
      detail: `Students: ${headcount_students}, Teams: ${teams}, Duration: ${duration_hours}h, Budget: Rs ${budget_total}`
    },
    {
      name: 'within budget',
      ok: budgetOk,
      detail: `Total Rs ${finalBudgetTotal.toLocaleString()} <= Limit Rs ${budget_total.toLocaleString()}`
    },
    {
      name: 'venue fits',
      ok: selectedVenue !== null && selectedVenue.capacity >= feed &&
          ctx.venueConstraints.every(vc => (selectedVenue.features || []).some(f => f.toLowerCase().includes(vc.requiredFeature))),
      detail: selectedVenue ? `${selectedVenue.name} capacity ${selectedVenue.capacity} >= ${feed} attendees` : 'No venue selected'
    },
    {
      name: 'schedule valid',
      ok: buildMinutes > 0 && currentMin === totalMinutes,
      detail: `Build time: ${buildMinutes} mins, Total duration: ${currentMin}/${totalMinutes} mins`
    },
    {
      name: 'enough judges',
      ok: judges_confirmed >= judges_needed && judges_needed > 0,
      detail: `${judges_confirmed} confirmed >= ${judges_needed} required`
    },
    {
      name: 'all areas covered',
      ok: !!(selectedVenue && schedule.length === 6 && foodTotalCost > 0 && judges_needed > 0 && finalBudgetLines.length >= 3),
      detail: 'Venue, Schedule, Food, Judging, and Budget are fully resolved'
    }
  ];

  return {
    plan,
    checks,
    ignored,
    decisions,
    notes,
    feed,
    claims
  };
}

/**
 * Validates new incoming message(s).
 * Rejects the message if any check fails or contradicts known facts.
 * 
 * @param {Array} currentMessages 
 * @param {object} newMessage 
 * @param {object} previousValidState 
 * @returns {object} { ok: boolean, result: object, rejectionReason: string|null }
 */
export function validateAndApplyMessage(currentMessages, newMessage, previousValidState) {
  const candidateMessages = [...currentMessages, newMessage];
  const result = buildPlan(candidateMessages);

  // Check 1: Claims validation (e.g. Caterer claims quantity < feed)
  for (const claim of result.claims) {
    if (claim.messageId === newMessage.id) {
      if (claim.about === 'food_quantity' || claim.about === 'lunch_boxes') {
        const claimedBoxes = Number(claim.value);
        if (claimedBoxes < result.feed) {
          return {
            ok: false,
            rejectionReason: `quantity ${claimedBoxes} is less than ${result.feed} people to feed`,
            feed: result.feed
          };
        }
      }
    }
  }

  // Check 2: Mandatory checks validation
  const failedCheck = result.checks.find(c => !c.ok);
  if (failedCheck) {
    return {
      ok: false,
      rejectionReason: `violates check '${failedCheck.name}': ${failedCheck.detail}`,
      failedCheck
    };
  }

  return {
    ok: true,
    result
  };
}
