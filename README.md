# mh

브라우저에서 바로 즐기는 실시간 멀티플레이 2D 액션 게임입니다.
서버는 Express + Socket.IO, 계정과 전적은 PostgreSQL에 저장합니다.

## 실행

```bash
npm install
npm start          # http://localhost:3000
```

| 환경변수 | 설명 | 기본값 |
|---|---|---|
| `PORT` | 서버 포트 | `3000` |
| `DATABASE_URL` | PostgreSQL 연결 문자열. 없으면 회원가입/로그인 API가 500을 반환하고 킬/데스는 저장되지 않습니다. | 없음 |

`accounts` 테이블은 서버 시작 시 자동으로 생성됩니다.

`localhost`로 접속하면 클라이언트가 로그인 API를 건너뛰므로 DB 없이도 바로 플레이해볼 수 있습니다.

## 테스트

```bash
npm test
```

Node 내장 테스트 러너(`node:test`)를 사용합니다. 순수 로직 단위 테스트와, 서버를 임의 포트에 띄워 Socket.IO 클라이언트로 전투·궁극기·접속 종료를 확인하는 통합 테스트가 있습니다.

## 구조

```
server.js               진입점
src/
  app.js                Express/Socket.IO 서버 생성, 시작
  config.js             게임 상수
  db.js                 PostgreSQL 연결, 계정 조회/전적 갱신
  socket.js             Socket.IO 이벤트 핸들러
  routes/auth.js        /api/auth/register, /api/auth/login
  auth/password.js      scrypt 비밀번호 해시
  utils/sanitize.js     입력값 정리
  utils/geometry.js     각도·거리 계산
  game/state.js         공유 상태 (players, io)
  game/stats.js         무기별 능력치, 사거리, 궁극기 설정
  game/action.js        클라이언트 액션 검증
  game/hits.js          공격당 중복 타격 방지
  game/combat.js        킬 처리, 활/애쉬 투사체 판정
  game/ultimates.js     무기별 궁극기
  game/pickups.js       회복 십자가, 거대화 물약
public/                 정적 파일 (이 폴더만 외부에 공개됩니다)
  mh.html
  style.css
  js/                   클래식 스크립트, mh.html에 적힌 순서대로 로드
    core.js             상수, 전역 상태, 플레이어
    network.js          서버 이벤트 수신
    hud.js              리더보드, HUD, 쿨다운 UI
    gameplay.js         이동·공격·스킬 로직
    input.js            키보드/마우스
    render.js           캔버스 그리기
    controls.js         모바일 조이스틱/버튼, 게임 루프
    auth-ui.js          로그인/회원가입, 무기·스킬 선택
```

클라이언트 스크립트는 전역 스코프를 공유하므로 `mh.html`의 `<script>` 순서를 바꾸지 마세요.
