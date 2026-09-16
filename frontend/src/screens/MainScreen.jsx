import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { theme } from '../theme';
import logo from '../assets/logo.png';

const API_BASE = 'http://localhost:8000';
// 팀원의 "할일 체크리스트" 백엔드(Planit-Web-Checklist-main, 8080번 포트).
// 두 프로젝트를 잇는 지점은 두 군데다:
//  (A)(B) 플랜 저장/조회는 파이썬(server.py + checklist_sync.py)이 Firestore를
//         통해서 중계한다 - 자세한 그림은 checklist_sync.py 맨 위 주석 참고.
//  (C) 여기(이 파일)는 그 중계를 안 거치고, 진도율 체크/오늘 마무리만 파이썬을
//      건너뛰어 팀원 서버를 브라우저에서 직접 호출한다. 팀원 쪽에 이미 검증
//      로직(진행률 허용값, 본인 소유 확인)이 테스트까지 돼 있어서 그대로 쓰는 것.
const JAVA_API_BASE = 'http://localhost:8080';
// 로그인 백엔드(Planit-Web-Auth-Plan-Quiz). 로그아웃 버튼만 여기서 직접
// 호출한다 - 세션 쿠키를 지우는 것도 결국 서버가 해야 하는 일이라서
// (HttpSession.invalidate()), 파이썬을 거칠 이유가 없다.
const AUTH_API_BASE = 'http://localhost:8081';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const PROGRESS_STEPS = [25, 50, 75, 100];
const DAY_CELL_HEIGHT = 168;

function toKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function todayKey() {
  const t = new Date();
  return toKey(t.getFullYear(), t.getMonth(), t.getDate());
}
function formatStopwatch(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function formatMinutesToHM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function downloadJson(plan) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'study_plan.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const page = {
  minHeight: '100vh',
  background: theme.colors.bg,
  fontFamily: theme.font,
  color: theme.colors.text,
};
const topbar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 28px',
  background: '#fff',
  borderBottom: `1px solid ${theme.colors.border}`,
  position: 'sticky',
  top: 0,
  zIndex: 10,
};
const hamburgerBtn = {
  position: 'fixed',
  top: 64,
  left: 28,
  zIndex: 9,
  border: 'none',
  background: 'transparent',
  fontSize: 20,
  cursor: 'pointer',
  color: theme.colors.text,
  padding: 4,
};
const sidebarOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.25)',
  zIndex: 19,
};
const sidebarPanel = {
  position: 'fixed',
  top: 0,
  left: 0,
  bottom: 0,
  width: 240,
  background: '#fff',
  borderRight: `1px solid ${theme.colors.border}`,
  boxShadow: theme.shadow,
  zIndex: 20,
  padding: '20px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const sidebarItem = {
  padding: '10px 12px',
  borderRadius: theme.radius.sm || 8,
  fontSize: 14,
  fontWeight: 600,
  color: theme.colors.text,
  cursor: 'pointer',
};
const sidebarItemDisabled = {
  ...sidebarItem,
  color: theme.colors.textSoft,
  cursor: 'not-allowed',
};
const sidebarDivider = {
  height: 1,
  background: theme.colors.border,
  margin: '8px 0',
};
const layoutScroll = {
  width: '100%',
  overflowX: 'auto',
};
const layout = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1090px) 320px',
  gap: 24,
  width: 1450,
  marginLeft: 100,
  marginTop: 28,
  marginBottom: 28,
  alignItems: 'start',
};
const s_btnSecondary = {
  fontFamily: theme.font,
  background: '#fff',
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.pill,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};
function s_btnPrimary(disabled) {
  return {
    fontFamily: theme.font,
    background: disabled ? theme.colors.disabled : theme.colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: theme.radius.pill,
    padding: '12px 0',
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: '100%',
  };
}

// 사이드바(마이페이지/학습통계/챗봇/로그아웃) - 에러/로딩/정상 화면 3곳에서
// 전부 똑같이 써서, 계획 유무와 상관없이 항상 메뉴를 쓸 수 있게 한다.
function Sidebar({ open, onClose, navigate, handleLogout }) {
  if (!open) return null;
  return (
    <>
      <div style={sidebarOverlay} onClick={onClose} />
      <div style={sidebarPanel}>
        <img
          src={logo}
          alt="Planit"
          style={{
            height: 24,
            width: 'auto',
            alignSelf: 'flex-start',
            marginBottom: 12,
          }}
        />
        <span
          style={sidebarItem}
          onClick={() => {
            onClose();
            navigate('/mypage');
          }}
        >
          마이페이지
        </span>
        <span
          style={sidebarItem}
          onClick={() => {
            onClose();
            navigate('/study-stats');
          }}
        >
          학습 통계
        </span>
        <span style={sidebarItemDisabled} title="준비중">
          챗봇 (준비중)
        </span>
        <div style={sidebarDivider} />
        <span
          style={sidebarItem}
          onClick={() => {
            onClose();
            handleLogout();
          }}
        >
          로그아웃
        </span>
      </div>
    </>
  );
}

export default function MainScreen({ onStartReplan }) {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [dragOverDate, setDragOverDate] = useState(null);
  const [actionMsg, setActionMsg] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const userId = localStorage.getItem('userId') || 'guest'; // TODO: 로그인 붙으면 이 fallback 제거
  const stopwatchStorageKey = `planit_stopwatch_${userId}`;

  // 새로고침/탭 재로드/컴퓨터 절전 이후에도 진행 중이던 스톱워치가 이어지도록,
  // localStorage에 저장해둔 값으로 초기 state를 복원한다. 실행 중이었다면
  // 저장 시점(savedAt)부터 지금까지 흐른 실제 시간만큼 더해준다.
  const loadStopwatch = () => {
    try {
      const raw = localStorage.getItem(stopwatchStorageKey);
      if (!raw) return { seconds: 0, running: false, startedAt: null };
      const saved = JSON.parse(raw);
      const elapsedSincePageClosed = saved.running
        ? Math.max(0, Math.floor((Date.now() - saved.savedAt) / 1000))
        : 0;
      return {
        seconds: (saved.seconds || 0) + elapsedSincePageClosed,
        running: !!saved.running,
        startedAt: saved.startedAt ? new Date(saved.startedAt) : null,
      };
    } catch {
      return { seconds: 0, running: false, startedAt: null };
    }
  };

  const [stopwatchSeconds, setStopwatchSeconds] = useState(
    () => loadStopwatch().seconds,
  );
  const [stopwatchRunning, setStopwatchRunning] = useState(
    () => loadStopwatch().running,
  );
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState(
    () => loadStopwatch().startedAt,
  );

  useEffect(() => {
    if (!stopwatchRunning) return;
    const id = setInterval(() => setStopwatchSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [stopwatchRunning]);

  // 값이 바뀔 때마다 바로 localStorage에 백업 - 여기 있는 값이 실제 진행 상태의
  // 유일한 저장소라서(서버에는 완료 시점에만 전송), 그 전에 새로고침/탭 재로드가
  // 일어나도 이 백업으로 이어서 복원한다.
  useEffect(() => {
    try {
      localStorage.setItem(
        stopwatchStorageKey,
        JSON.stringify({
          seconds: stopwatchSeconds,
          running: stopwatchRunning,
          startedAt: stopwatchStartedAt
            ? stopwatchStartedAt.toISOString()
            : null,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // localStorage를 못 쓰는 환경이면 그냥 이번 세션 동안만 메모리로 유지한다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopwatchSeconds, stopwatchRunning, stopwatchStartedAt]);

  const handleStopwatchToggle = () => {
    setStopwatchRunning((r) => {
      const next = !r;
      if (next && stopwatchStartedAt == null) {
        setStopwatchStartedAt(new Date());
      }
      return next;
    });
  };

  const handleStopwatchReset = () => {
    setStopwatchRunning(false);
    setStopwatchSeconds(0);
    setStopwatchStartedAt(null);
    try {
      localStorage.removeItem(stopwatchStorageKey);
    } catch {
      // 무시 - 다음 렌더에서 0으로 다시 저장됨
    }
  };

  const reloadPlan = () =>
    fetch(`${API_BASE}/plans/${userId}`)
      .then((res) => {
        if (!res.ok) throw new Error('저장된 학습 플랜이 없습니다.');
        return res.json();
      })
      .then((data) => {
        setPlan(data);
        setError('');
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    reloadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planByDate = useMemo(() => {
    const map = {};
    (plan?.days || []).forEach((day) => {
      map[day.date] = day;
    });
    return map;
  }, [plan]);

  const firstDayWithPlan = plan?.days?.[0]?.date;
  const initialMonth = firstDayWithPlan
    ? new Date(firstDayWithPlan)
    : new Date();
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey());

  const todayItems = planByDate[todayKey()]?.items || [];
  const memberId = plan?.memberId;

  const handleSetProgress = async (itemId, progressRate) => {
    if (memberId == null) return;
    setActionMsg('');
    try {
      const res = await fetch(
        `${JAVA_API_BASE}/api/study-plan-items/${itemId}/progress?memberId=${memberId}&progressRate=${progressRate}`,
        { method: 'PATCH' },
      );
      if (!res.ok) throw new Error('진도율 저장에 실패했습니다.');
      await reloadPlan();
    } catch (e) {
      setActionMsg(e.message);
    }
  };

  // 스톱워치로 잰 경과 시간을 study_sessions에 기록한다 - 통계/뱃지/레이더차트
  // (study-stats-data.js, radar-metrics.js, badgeChecker.js)가 전부 이 컬렉션을
  // memberId(=localStorage의 userId)로 조회하므로, 여기서도 반드시 그 userId를
  // 써야 한다 (Java 체크리스트 API용 memberId와는 다른 값).
  const recordStudySession = async () => {
    if (stopwatchSeconds <= 0) return;
    const startedAt =
      stopwatchStartedAt ?? new Date(Date.now() - stopwatchSeconds * 1000);
    await addDoc(collection(db, 'study_sessions'), {
      memberId: userId,
      startedAt: Timestamp.fromDate(startedAt),
      durationSeconds: stopwatchSeconds,
    });
    setStopwatchRunning(false);
    setStopwatchSeconds(0);
    setStopwatchStartedAt(null);
    try {
      localStorage.removeItem(stopwatchStorageKey);
    } catch {
      // 지우기 실패해도 다음 렌더에서 0으로 다시 저장되므로 무시한다.
    }
  };

  const handleCompleteDay = async () => {
    if (memberId == null) return;
    setSaving(true);
    setSaveMsg('');
    const errors = [];

    try {
      const res = await fetch(
        `${JAVA_API_BASE}/api/study-plan-items/complete-day?memberId=${memberId}&date=${todayKey()}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error('오늘 학습 마무리에 실패했습니다.');
    } catch (e) {
      errors.push(e.message);
    }

    try {
      await recordStudySession();
    } catch (e) {
      errors.push('학습 시간 저장 실패: ' + e.message);
    }

    setSaveMsg(
      errors.length ? errors.join(' / ') : '오늘 학습을 마무리했어요!',
    );
    setSaving(false);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${AUTH_API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // 로그아웃 요청이 실패해도 로컬 로그인 상태는 지워서 화면은 로그인 화면으로 보낸다.
    }
    localStorage.removeItem('userId');
    window.location.href = '/upload';
  };

  const handleDrop = async (targetDate, e) => {
    e.preventDefault();
    setDragOverDate(null);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const { itemId, date: fromDate } = JSON.parse(raw);
    if (fromDate === targetDate) return;

    try {
      const res = await fetch(`${API_BASE}/plans/${userId}/move-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, toDate: targetDate }),
      });
      if (!res.ok) throw new Error('항목 이동에 실패했습니다.');
      const updated = await res.json();
      setPlan(updated);
      setActionMsg('');
    } catch (e2) {
      setActionMsg(e2.message);
    }
  };

  if (error || !plan) {
    return (
      <div style={page}>
        <div style={topbar}>
          <img src={logo} alt="Planit" style={{ height: 28 }} />
        </div>
        <button
          style={hamburgerBtn}
          title="메뉴"
          onClick={() => setSidebarOpen(true)}
        >
          ☰
        </button>
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          navigate={navigate}
          handleLogout={handleLogout}
        />
        {error && (
          <p style={{ padding: 28, color: theme.colors.danger }}>{error}</p>
        )}
      </div>
    );
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const goPrevMonth = () => {
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    setViewMonth(m);
    setViewYear(y);
  };
  const goNextMonth = () => {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    setViewMonth(m);
    setViewYear(y);
  };

  const selectedDay = selectedDate
    ? planByDate[selectedDate] || { date: selectedDate, minutes: 0, items: [] }
    : null;
  const totalItems = (plan.days || []).reduce(
    (sum, d) => sum + d.items.length,
    0,
  );
  const totalMinutes = (plan.days || []).reduce((sum, d) => sum + d.minutes, 0);
  const totalDays = (plan.days || []).length;
  const avgMinutesPerDay =
    totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0;

  return (
    <div style={page}>
      <div style={topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src={logo} alt="Planit" style={{ height: 28 }} />
        </div>
      </div>
      <button
        style={hamburgerBtn}
        title="메뉴"
        onClick={() => setSidebarOpen(true)}
      >
        ☰
      </button>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        navigate={navigate}
        handleLogout={handleLogout}
      />

      <div style={layoutScroll}>
        <div style={layout}>
          <div
            style={{
              background: '#fff',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.lg,
              padding: 24,
              boxShadow: theme.shadow,
            }}
          >
            <p
              style={{
                color: theme.colors.textSoft,
                margin: '0 0 12px',
                fontSize: 14,
              }}
            >
              총 {totalItems}개 항목 · 하루 평균{' '}
              {formatMinutesToHM(avgMinutesPerDay)} 배정 · 항목을 다른 날짜로
              드래그해서 옮길 수 있어요
            </p>
            {actionMsg && (
              <p
                style={{
                  color: theme.colors.danger,
                  fontSize: 13,
                  fontWeight: 600,
                  margin: '0 0 12px',
                }}
              >
                {actionMsg}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                marginBottom: 12,
              }}
            >
              <button onClick={goPrevMonth} style={s_btnSecondary}>
                ◀
              </button>
              <strong style={{ fontSize: 18 }}>
                {viewYear}년 {viewMonth + 1}월
              </strong>
              <button onClick={goNextMonth} style={s_btnSecondary}>
                ▶
              </button>
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr>
                  {WEEKDAY_LABELS.map((w) => (
                    <th
                      key={w}
                      style={{
                        padding: 8,
                        color: theme.colors.textSoft,
                        fontWeight: 500,
                        fontSize: 13,
                      }}
                    >
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: Math.ceil(cells.length / 7) },
                  (_, row) => (
                    <tr key={row}>
                      {cells.slice(row * 7, row * 7 + 7).map((d, i) => {
                        if (d === null)
                          return (
                            <td
                              key={i}
                              style={{ verticalAlign: 'top', padding: 4 }}
                            />
                          );
                        const key = toKey(viewYear, viewMonth, d);
                        const day = planByDate[key] || {
                          date: key,
                          minutes: 0,
                          items: [],
                        };
                        const isSelected = key === selectedDate;
                        const isToday = key === todayKey();
                        const isDragOver = dragOverDate === key;
                        return (
                          <td
                            key={i}
                            style={{ verticalAlign: 'top', padding: 4 }}
                          >
                            <div
                              onClick={() => setSelectedDate(key)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverDate(key);
                              }}
                              onDragLeave={() =>
                                setDragOverDate((cur) =>
                                  cur === key ? null : cur,
                                )
                              }
                              onDrop={(e) => handleDrop(key, e)}
                              style={{
                                height: DAY_CELL_HEIGHT,
                                display: 'flex',
                                flexDirection: 'column',
                                borderRadius: theme.radius.sm,
                                border: isDragOver
                                  ? `2px dashed ${theme.colors.primary}`
                                  : isSelected
                                    ? `2px solid ${theme.colors.primary}`
                                    : isToday
                                      ? `1.5px solid ${theme.colors.primaryDark}`
                                      : `1px solid ${theme.colors.border}`,
                                background: isDragOver
                                  ? theme.colors.primarySoft
                                  : isSelected
                                    ? '#FBF9FE'
                                    : '#fff',
                                padding: 6,
                                cursor: 'pointer',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: theme.colors.text,
                                  marginBottom: 5,
                                  flexShrink: 0,
                                }}
                              >
                                {d}
                              </div>
                              <div
                                style={{
                                  overflowY: 'auto',
                                  flex: 1,
                                  minHeight: 0,
                                }}
                              >
                                {day.items.map((item) => (
                                  <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      e.dataTransfer.setData(
                                        'text/plain',
                                        JSON.stringify({
                                          itemId: item.id,
                                          date: key,
                                        }),
                                      );
                                    }}
                                    title={item.content}
                                    style={{
                                      background: theme.colors.primarySoft,
                                      color: theme.colors.primaryDark,
                                      borderRadius: 6,
                                      padding: '4px 7px',
                                      fontSize: 12.5,
                                      fontWeight: 600,
                                      marginBottom: 4,
                                      cursor: 'grab',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {item.content} · {item.durationMinutes}분
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            <div
              style={{
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.md,
                padding: 16,
                marginTop: 16,
                background: '#FBF9FE',
              }}
            >
              {!selectedDay ? (
                <p
                  style={{
                    color: theme.colors.textSoft,
                    margin: 0,
                    fontSize: 14,
                  }}
                >
                  날짜를 선택하면 그날의 학습 항목을 보여줍니다.
                </p>
              ) : (
                <>
                  <strong>
                    {selectedDay.date} ({selectedDay.minutes}분)
                  </strong>
                  {selectedDay.items.length === 0 ? (
                    <p
                      style={{
                        color: theme.colors.textSoft,
                        margin: '6px 0 0',
                      }}
                    >
                      배정된 항목 없음
                    </p>
                  ) : (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      {selectedDay.items.map((item) => (
                        <li
                          key={item.id}
                          style={{ marginBottom: 4, fontSize: 14 }}
                        >
                          {item.subject ? `${item.subject} · ` : ''}
                          {item.content}{' '}
                          <span style={{ color: theme.colors.textSoft }}>
                            ({item.durationMinutes}분)
                          </span>{' '}
                          ({item.progressRate}%{item.completed ? ', 완료' : ''})
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => downloadJson(plan)} style={s_btnSecondary}>
                JSON으로 저장
              </button>
              <button onClick={onStartReplan} style={s_btnSecondary}>
                계획 다시 생성하기
              </button>
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.lg,
              boxShadow: theme.shadow,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '20px 20px 0',
                textAlign: 'center',
                borderBottom: `1px solid ${theme.colors.border}`,
                paddingBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  letterSpacing: 1,
                  marginBottom: 10,
                }}
              >
                {formatStopwatch(stopwatchSeconds)}
              </div>
              <div
                style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
              >
                <button onClick={handleStopwatchToggle} style={s_btnSecondary}>
                  {stopwatchRunning ? '중단' : '시작'}
                </button>
                <button onClick={handleStopwatchReset} style={s_btnSecondary}>
                  초기화
                </button>
              </div>
            </div>

            <div style={{ padding: 20, flex: 1 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>오늘 할 일</h3>
              {todayItems.length === 0 ? (
                <p style={{ color: theme.colors.textSoft, fontSize: 14 }}>
                  오늘 배정된 학습 항목이 없어요.
                </p>
              ) : (
                todayItems.map((item) => (
                  <div key={item.id} style={{ marginBottom: 18 }}>
                    <p
                      style={{
                        margin: '0 0 8px',
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {item.content}
                      {item.subject && (
                        <span
                          style={{
                            color: theme.colors.primaryDark,
                            fontWeight: 700,
                          }}
                        >
                          {' '}
                          · {item.subject}
                        </span>
                      )}
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PROGRESS_STEPS.map((p) => {
                        const active = item.progressRate === p;
                        return (
                          <button
                            key={p}
                            onClick={() => handleSetProgress(item.id, p)}
                            style={{
                              flex: 1,
                              padding: '6px 0',
                              borderRadius: theme.radius.pill,
                              border: active
                                ? 'none'
                                : `1px solid ${theme.colors.border}`,
                              background: active
                                ? theme.colors.primary
                                : '#fff',
                              color: active ? '#fff' : theme.colors.textSoft,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {p}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            {todayItems.length > 0 && (
              <div
                style={{
                  borderTop: `1px solid ${theme.colors.border}`,
                  padding: 16,
                }}
              >
                {saveMsg && (
                  <p
                    style={{
                      fontSize: 12,
                      color: theme.colors.primaryDark,
                      margin: '0 0 8px',
                    }}
                  >
                    {saveMsg}
                  </p>
                )}
                <button
                  onClick={handleCompleteDay}
                  disabled={saving}
                  style={s_btnPrimary(saving)}
                >
                  {saving ? '저장 중...' : '오늘 학습 마무리하기'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
