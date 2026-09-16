import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MyPageScreen.css';
import { auth } from '../firebase';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth';

// =========================================================================
// 회원정보 전용 마이페이지 (mypage_mockup.html을 React로 옮긴 버전).
// "학습 통계"(StudyStatsScreen.jsx)와는 완전히 별개 화면.
// 이름만 수정 가능, 이메일은 읽기 전용.
//
// AUTH_API_BASE: 로그인 백엔드(김동호) 포트. 8080.
// =========================================================================
const AUTH_API_BASE = 'http://localhost:8080';
// 로그아웃은 다른 화면(MainScreen.jsx, StudyStatsScreen.jsx)과 동일하게
// 8081번 포트를 쓴다 - 탈퇴(AUTH_API_BASE)와 실제로 다른 값이라 따로 뒀다.
const LOGOUT_API_BASE = 'http://localhost:8081';

// MainScreen.jsx/StudyStatsScreen.jsx와 동일한 상단바 + 햄버거 메뉴
// (fallback 색상은 StudyStatsScreen.css :root 값과 동일 - 이 화면 CSS엔
//  그 변수가 정의돼 있지 않아서, 다른 화면을 안 거치고 바로 /mypage로
//  들어와도 깨지지 않게 기본값을 같이 적어둔다.)
const topbar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 28px',
  background: '#fff',
  borderBottom: '1px solid var(--line, #F7DCE0)',
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
  color: 'var(--ink, #4B3B47)',
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
  borderRight: '1px solid var(--line, #F7DCE0)',
  boxShadow: '0 12px 28px -14px rgba(169,143,194,0.35)',
  zIndex: 20,
  padding: '20px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const sidebarItem = {
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--ink, #4B3B47)',
  cursor: 'pointer',
};
const sidebarItemDisabled = {
  ...sidebarItem,
  color: 'var(--ink-soft, #8B7488)',
  cursor: 'not-allowed',
};
const sidebarDivider = {
  height: 1,
  background: 'var(--line, #F7DCE0)',
  margin: '8px 0',
};

const Icon = {
  user: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  ),
  mail: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
      <path d="m2 7 10 6 10-6"></path>
    </svg>
  ),
  photo: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="4"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <path d="m21 15-5-5L5 21"></path>
    </svg>
  ),
  lock: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  ),
  trash: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M4 7h16"></path>
      <path d="M6 7V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3"></path>
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"></path>
    </svg>
  ),
};

export default function MyPageScreen() {
  const navigate = useNavigate();
  const [memberId] = useState(() => localStorage.getItem('userId'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!memberId) return;
    (async () => {
      const snap = await getDoc(doc(db, 'users', memberId));
      if (snap.exists()) {
        setName(snap.data().name || '');
        setEmail(snap.data().email || '');
      }
      setLoading(false);
    })();
  }, [memberId]);

  const handleEditName = async () => {
    const newName = window.prompt('새 이름을 입력하세요', name);
    if (!newName || newName.trim() === '') return;
    try {
      await updateDoc(doc(db, 'users', memberId), { name: newName.trim() });
      if (auth.currentUser)
        await updateProfile(auth.currentUser, { displayName: newName.trim() });
      setName(newName.trim());
      setMsg({ type: 'ok', text: '이름이 변경됐어요.' });
    } catch (e) {
      setMsg({ type: 'err', text: '이름 변경에 실패했어요: ' + e.message });
    }
  };

  const handleResetPassword = async () => {
    if (!email)
      return setMsg({ type: 'err', text: '이메일 정보를 불러오지 못했어요.' });
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg({
        type: 'ok',
        text: `${email}로 비밀번호 재설정 메일을 보냈어요.`,
      });
    } catch (e) {
      setMsg({ type: 'err', text: '메일 발송에 실패했어요: ' + e.message });
    }
  };

  const handlePhotoChange = () => {
    setMsg({ type: 'ok', text: '프로필 사진 변경 기능은 준비 중이에요.' });
  };

  const handleWithdraw = async () => {
    if (
      !window.confirm(
        '정말 탈퇴하시겠습니까?\n계정과 학습 데이터가 모두 삭제되며 되돌릴 수 없습니다.',
      )
    )
      return;
    try {
      await fetch(`${AUTH_API_BASE}/api/auth/withdraw`, {
        method: 'POST',
        credentials: 'include',
      });
      localStorage.removeItem('userId');
      window.location.href = '/';
    } catch (e) {
      setMsg({
        type: 'err',
        text: '탈퇴 처리 중 오류가 발생했어요: ' + e.message,
      });
    }
  };

  // MainScreen.jsx/StudyStatsScreen.jsx의 로그아웃과 동일한 로직
  const handleLogout = async () => {
    try {
      await fetch(`${LOGOUT_API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // 로그아웃 요청이 실패해도 로컬 로그인 상태는 지워서 화면은 로그인 화면으로 보낸다.
    }
    localStorage.removeItem('userId');
    window.location.href = '/upload';
  };

  if (!memberId) {
    return (
      <div className="mypage-root">
        <p>로그인이 필요해요.</p>
      </div>
    );
  }
  if (loading) {
    return <div className="mypage-root"></div>;
  }

  return (
    <div className="mypage-root">
      <div style={topbar}>
        <img
          src="/wordmark.png"
          alt="Planit"
          style={{ height: 28, cursor: 'pointer' }}
          onClick={() => navigate('/main')}
        />
      </div>
      <button
        style={hamburgerBtn}
        title="메뉴"
        onClick={() => setSidebarOpen(true)}
      >
        ☰
      </button>
      {sidebarOpen && (
        <>
          <div style={sidebarOverlay} onClick={() => setSidebarOpen(false)} />
          <div style={sidebarPanel}>
            <img
              src="/wordmark.png"
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
                setSidebarOpen(false);
                navigate('/mypage');
              }}
            >
              마이페이지
            </span>
            <span
              style={sidebarItem}
              onClick={() => {
                setSidebarOpen(false);
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
                setSidebarOpen(false);
                handleLogout();
              }}
            >
              로그아웃
            </span>
          </div>
        </>
      )}

      <div className="mypage-page">
        <div className="mypage-layout">
          <aside className="mypage-sidebar">
            <div className="mypage-avatar">{name ? name.slice(0, 1) : 'P'}</div>
            <div className="mypage-side-name">{name || '회원'}</div>
            <div className="mypage-side-email">{email}</div>
            <nav className="mypage-side-nav">
              <a href="#profile-card">회원 프로필</a>
              <a href="#account-card">계정 관리</a>
            </nav>
          </aside>

          <div className="mypage-content">
            {msg && <p className={`mypage-msg ${msg.type}`}>{msg.text}</p>}

            <section className="mypage-card" id="profile-card">
              <div className="mypage-card-header">회원 프로필</div>
              <div className="mypage-card-body">
                <div className="mypage-row">
                  <div className="mypage-row-label">
                    <div className="mypage-row-icon">{Icon.user}</div>
                    <div className="mypage-row-text">
                      <div className="t">이름</div>
                      <div className="d">{name}</div>
                    </div>
                  </div>
                  <button
                    className="mypage-btn mypage-btn-ghost"
                    onClick={handleEditName}
                  >
                    수정
                  </button>
                </div>
                <div className="mypage-row">
                  <div className="mypage-row-label">
                    <div className="mypage-row-icon">{Icon.mail}</div>
                    <div className="mypage-row-text">
                      <div className="t">이메일</div>
                      <div className="d">{email}</div>
                    </div>
                  </div>
                </div>
                <div className="mypage-row">
                  <div className="mypage-row-label">
                    <div className="mypage-row-icon">{Icon.photo}</div>
                    <div className="mypage-row-text">
                      <div className="t">프로필 사진</div>
                      <div className="d">기본 이미지 사용 중</div>
                    </div>
                  </div>
                  <button
                    className="mypage-btn mypage-btn-ghost"
                    onClick={handlePhotoChange}
                  >
                    변경
                  </button>
                </div>
              </div>
            </section>

            <section className="mypage-card" id="account-card">
              <div className="mypage-card-header">계정 관리</div>
              <div className="mypage-card-body">
                <div className="mypage-row">
                  <div className="mypage-row-label">
                    <div className="mypage-row-icon">{Icon.lock}</div>
                    <div className="mypage-row-text">
                      <div className="t">비밀번호 변경</div>
                      <div className="d">이메일로 재설정 링크를 보내드려요</div>
                    </div>
                  </div>
                  <button
                    className="mypage-btn mypage-btn-primary"
                    onClick={handleResetPassword}
                  >
                    변경
                  </button>
                </div>
                <div className="mypage-row mypage-danger-row">
                  <div className="mypage-row-label">
                    <div className="mypage-row-icon">{Icon.trash}</div>
                    <div className="mypage-row-text">
                      <div className="t">회원 탈퇴</div>
                      <div className="d">
                        탈퇴 시 모든 학습 데이터가 삭제되고 복구할 수 없어요
                      </div>
                    </div>
                  </div>
                  <button
                    className="mypage-btn mypage-btn-danger"
                    onClick={handleWithdraw}
                  >
                    탈퇴하기
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
