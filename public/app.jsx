const DIRECTION_ANGLES = {north: 0, east: 90, south: 180, west: 270};

function Robot({robot, names}) {
    if (robot.x == null || robot.y == null) return null;
    const style = {
        left: `${(robot.x + .5) / 12 * 100}%`,
        top: `${(robot.y + .5) / 16 * 100}%`,
        "--robot-color": robot.color,
        "--robot-angle": `${DIRECTION_ANGLES[robot.direction]}deg`
    };
    return <div className={`robot ${robot.eliminated ? "eliminated" : ""}`} style={style}
                title={`${names[robot.userId] || robot.userId}: ${robot.x + 1}, ${robot.y + 1}`}>
        <span className="robot-heading">▲</span>
    </div>;
}

function PlayerPanel({state}) {
    const robotsByUser = {};
    state.robots.forEach((robot) => robotsByUser[robot.userId] = robot);
    return <section className="players-panel panel">
        <h2>Роботы</h2>
        {state.playerSlots.filter(Boolean).map((userId) => {
            const robot = robotsByUser[userId] || {};
            const stats = (state.playerStats && state.playerStats[userId]) || {};
            return <div className="player-row" key={userId}>
                <i style={{background: robot.color}}></i>
                <span className={userId === state.userId ? "own-player-name" : "player-name"}>{state.playerNames[userId]}</span>
                <span>⚑ {stats.checkpoints || 0}/{state.flags.length}</span>
                <span>⚡ {stats.damage || 0}</span>
                <span>♥ {stats.lives == null ? 0 : stats.lives}</span>
                {stats.poweredDown ? <small>POWER DOWN</small> : null}
            </div>;
        })}
    </section>;
}

function FieldGuide() {
    return <details className="panel field-guide">
        <summary>Памятка по полю</summary>
        <ol><li>Открыть карты регистра</li><li>Роботы: больший приоритет раньше</li><li>Экспресс-конвейеры</li><li>Все конвейеры</li><li>Толкатели</li><li>Шестерни</li><li>Лазеры поля и роботов</li><li>Флаги и архивы</li></ol>
        <dl>
            <dt>Конвейер</dt><dd>Двигает одновременно, роботов не толкает. Синий экспресс движется дважды.</dd>
            <dt>Поворотный конвейер</dt><dd>Поворачивает робота, только когда лента переместила его на изгиб.</dd>
            <dt>Толкатель</dt><dd>После конвейеров толкает робота на одну клетку от стены только в номера регистров, напечатанные на самом толкателе.</dd>
            <dt>Шестерня</dt><dd>Поворачивает на 90°.</dd>
            <dt>Лазер</dt><dd>Наносит урон после движения поля; стены и первый робот останавливают луч.</dd>
            <dt>Ключ</dt><dd>Архив; после регистра 5 снимает 1 повреждение.</dd>
            <dt>Флаг + ключ</dt><dd>Нужно коснуться по порядку; это архив и обычный ключ, снимающий 1 повреждение после регистра 5.</dd>
            <dt>Power Down</dt><dd>Выбирается вместо программы и блокирует регистры. До нажатия «Готов» выбор можно отменить; после подтверждения он скрыт до общего раскрытия. Выключенный робот не стреляет.</dd>
            <dt>Возрождение</dt><dd>Происходит до раздачи карт: на свободном архиве можно выбрать любое направление; при занятом архиве выбирается допустимая соседняя клетка и направление.</dd>
            <dt>Яма/край</dt><dd>Уничтожение, потеря жизни, возврат на архив с 2 повреждениями.</dd>
        </dl>
    </details>;
}

function Lobby({state, app}) {
    const playerCount = state.playerSlots.filter(Boolean).length;
    return <section className="lobby panel">
        <h2>Лобби · комната {state.roomId}</h2>
        <p>RoboRally — запрограммируйте пять действий робота и переживите завод.</p>
        <div className="seats">
            {state.playerSlots.map((userId, slot) => <button key={slot}
                className={userId ? "seat occupied" : "seat"}
                disabled={!!userId && userId !== state.userId}
                onClick={() => !userId && app.socket.emit("players-join", slot)}>
                {userId ? state.playerNames[userId] : `Робот ${slot + 1}`}
            </button>)}
        </div>
        {state.userId === state.hostId ? <CourseSetup state={state} app={app} playerCount={playerCount}/> : <p>Хост выбирает курс.</p>}
        {state.userId === state.hostId ? <button className="primary" disabled={state.playerSlots.filter(Boolean).length < 2}
            onClick={() => app.socket.emit("start-game")}>Начать игру</button> : <p>Ожидание запуска хостом.</p>}
        <p className="hint">Для теста в одном браузере используйте разные параметры <code>player</code> и <code>name</code> в URL.</p>
    </section>;
}

class CourseSetup extends React.Component {
    constructor(props) {
        super(props);
        this.state = {board: props.state.course.board, start: props.state.course.start, rotation: props.state.course.rotation || 0,
            name: "Мой курс", flags: "2,2; 9,5; 5,9"};
    }

    saveCustom() {
        const flags = this.state.flags.split(";").map((item) => item.trim().split(",").map(Number))
            .filter((item) => item.length === 2 && item.every(Number.isInteger));
        this.props.app.socket.emit("set-custom-course", {name: this.state.name, board: this.state.board, start: this.state.start,
            rotation: Number(this.state.rotation), flags});
    }

    render() {
        const {state, app, playerCount} = this.props;
        const selected = state.course.id;
        const previewFlags = this.state.flags.split(";").map((item) => item.trim().split(",").map(Number))
            .filter((item) => item.length === 2 && item.every(Number.isInteger)
                && item[0] >= 0 && item[0] < 12 && item[1] >= 0 && item[1] < 12);
        return <div className="course-setup">
            <h3>Готовые курсы</h3>
            <div className="course-list">{state.courses.map((course) => <button key={course.id}
                className={`course-card ${selected === course.id ? "selected" : ""} ${playerCount >= course.min && playerCount <= course.max ? "recommended" : ""}`}
                onClick={() => app.socket.emit("select-course", course.id)}>
                <strong>{course.name}</strong><span>{course.board} · {course.length}</span><small>Игроки: {course.players} · {course.level}</small>
            </button>)}</div>
            <details className="constructor"><summary>Конструктор своего курса</summary>
                <div className="constructor-fields">
                    <label>Название<input value={this.state.name} onChange={(event) => this.setState({name: event.target.value})}/></label>
                    <label>Карта<select value={this.state.board} onChange={(event) => this.setState({board: event.target.value})}>{Object.keys(state.boardCards).map((board) => <option key={board}>{board}</option>)}</select></label>
                    <label>Старт<select value={this.state.start} onChange={(event) => this.setState({start: event.target.value})}>{state.startCards.map((start) => <option key={start}>{start.replace(".jpg", "")}</option>)}</select></label>
                    <label>Поворот карты<select value={this.state.rotation} onChange={(event) => this.setState({rotation: Number(event.target.value)})}>
                        {[0,90,180,270].map((rotation) => <option value={rotation} key={rotation}>{rotation}°</option>)}</select></label>
                    <label>Флаги (клетки x,y)<input value={this.state.flags} onChange={(event) => this.setState({flags: event.target.value})}/></label>
                </div>
                <div className="constructor-preview"
                    onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const x = Math.min(11, Math.floor((event.clientX - rect.left) / rect.width * 12));
                        const y = Math.min(11, Math.floor((event.clientY - rect.top) / rect.height * 12));
                        const flags = this.state.flags.split(";").filter(Boolean);
                        flags.push(`${x},${y}`);
                        this.setState({flags: flags.slice(-8).join("; ")});
                    }}><img className="constructor-preview-board" style={{transform: `rotate(${this.state.rotation}deg)`}}
                        src={`/roborally/materials/${encodeURIComponent("Поля целиком")}/${encodeURIComponent(state.boardCards[this.state.board])}`}/>
                    <span className="preview-help">Щелчок добавляет флаг в центр выбранной клетки</span>
                    {previewFlags.map(([x, y], index) => <b className="preview-flag" key={`${x},${y},${index}`}
                        style={{left: `${(x + .5) / 12 * 100}%`, top: `${(y + .5) / 12 * 100}%`}}>{index + 1}</b>)}
                </div>
                <button type="button" onClick={() => this.saveCustom()}>Сохранить свой курс</button>
            </details>
        </div>;
    }
}

function Program({state, privateState, app}) {
    if (state.phase !== "programming") return null;
    const selected = privateState.selected || [];
    const selectedCount = selected.filter(Boolean).length;
    const registerCards = privateState.registerCards || [];
    const lockedRegisters = privateState.lockedRegisters || [];
    const drag = (event, payload) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/json", JSON.stringify(payload));
    };
    const drop = (event, register) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            const payload = JSON.parse(event.dataTransfer.getData("application/json"));
            if (payload.kind === "register") app.socket.emit("swap-registers", {from: payload.register, to: register});
            if (payload.kind === "card") app.socket.emit("assign-register", {cardId: payload.cardId, register});
        } catch (error) {}
    };
    const dropOnRegisters = (event) => {
        event.preventDefault();
        const registers = [...event.currentTarget.querySelectorAll(".register")];
        const nearest = registers.map((element, register) => {
            const rect = element.getBoundingClientRect();
            const x = Math.max(rect.left, Math.min(event.clientX, rect.right));
            const y = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
            return {register, distance: Math.hypot(event.clientX - x, event.clientY - y)};
        }).sort((left, right) => left.distance - right.distance)[0];
        if (nearest) drop(event, nearest.register);
    };
    return <section className="program panel">
        <div className="program-heading">
            <div><h2>Программирование · раунд {state.round}</h2><p>Выберите ровно 5 карт. Их порядок — порядок регистров.</p></div>
            <div className="program-actions">
                <button onClick={() => app.socket.emit("auto-program")} disabled={privateState.locked || privateState.powerDownSelected}>Авто</button>
                <button onClick={() => app.socket.emit("power-down")} disabled={privateState.locked}>
                    {privateState.powerDownSelected ? "Отменить Power Down" : "Power Down вместо программы"}
                </button>
                <button className="primary" onClick={() => app.socket.emit("lock-program")}
                    disabled={(!privateState.powerDownSelected && selectedCount !== 5) || privateState.locked}>{privateState.locked ? "Готов ✓" : "Готов"}</button>
            </div>
        </div>
        <div className="registers" onDragOver={(event) => !privateState.locked && !privateState.powerDownSelected && event.preventDefault()}
            onDrop={dropOnRegisters}>
            {[0, 1, 2, 3, 4].map((index) => {
                const card = registerCards[index] || privateState.hand.find((item) => item.id === selected[index]);
                return <div className={`register ${lockedRegisters.includes(index) ? "locked" : ""}`} key={index}
                    draggable={!!card && !lockedRegisters.includes(index) && !privateState.locked && !privateState.powerDownSelected}
                    onDragStart={(event) => drag(event, {kind: "register", register: index})}
                    onDragOver={(event) => !lockedRegisters.includes(index) && event.preventDefault()}
                    onDrop={(event) => drop(event, index)}
                    onDoubleClick={() => app.socket.emit("clear-register", index)}>
                    <b>{index + 1}</b><span>{card ? card.label : "—"}</span>
                    {card ? <small className="priority-badge" title="Приоритет карты">{card.priority}</small> : null}
                    {lockedRegisters.includes(index) ? <em>заблокирован</em> : null}
                </div>;
            })}
        </div>
        <div className="cards">
            {privateState.hand.map((card) => {
                const selectedIndex = selected.indexOf(card.id);
                return <button className={`card ${selectedIndex >= 0 ? "selected" : ""}`} key={card.id}
                    disabled={privateState.locked || privateState.powerDownSelected}
                    draggable={!privateState.locked && !privateState.powerDownSelected}
                    onDragStart={(event) => drag(event, {kind: "card", cardId: card.id})}
                    onClick={() => app.socket.emit("toggle-card", card.id)}>
                    {selectedIndex >= 0 ? <small className="selected-register-label">{`Регистр ${selectedIndex + 1}`}</small> : null}
                    <b className="priority-badge" title="Приоритет карты">{card.priority}</b>
                    <strong>{card.label}</strong>
                    <span>{card.type === "left" ? "↶" : card.type === "right" ? "↷" : card.type === "uturn" ? "↻" : card.type === "backup" ? "↓" : "↑"}</span>
                </button>;
            })}
        </div>
    </section>;
}

function PublicPrograms({state}) {
    if (state.phase !== "resolving" && state.phase !== "finished") return null;
    return <section className="public-programs panel"><h2>Регистры роботов</h2>
        {state.playerSlots.filter(Boolean).map((userId) => {
            const program = (state.programs && state.programs[userId]) || {cards: []};
            return <div className="public-program-row" key={userId}>
                <span className={userId === state.userId ? "own-player-name" : "player-name"}>{state.playerNames[userId]}</span>
                <div>{[0,1,2,3,4].map((index) => {
                    const card = program.cards[index];
                    const current = state.phase === "resolving" && state.register === index + 1;
                    const isRevealed = !!card || (program.poweredDown && index < (state.revealedRegisters || 0));
                    return <span className={`public-register ${isRevealed ? "revealed" : "closed"} ${current ? "current" : ""}`} key={index}
                        title={card ? `${card.label}, приоритет ${card.priority}` : "Закрытый регистр"}>
                        {program.poweredDown ? (isRevealed ? "Zzz" : "?") : card ? <><b>{card.label}</b><small className="priority-badge" title="Приоритет карты">{card.priority}</small></> : "?"}
                    </span>;
                })}</div>
            </div>;
        })}
    </section>;
}

function ReentryPanel({state, privateState, app}) {
    if (state.phase !== "reentry") return null;
    const reentry = privateState.reentry || {active: false, candidates: []};
    const activeName = state.playerNames[state.reentryUserId] || "игрок";
    if (!reentry.active)
        return <section className="reentry-panel panel"><h2>Возрождение</h2><p>Ожидаем, пока {activeName} выберет клетку и направление.</p></section>;
    const arrows = {north: "↑", east: "→", south: "↓", west: "←"};
    return <section className="reentry-panel panel">
        <h2>Выберите возрождение</h2>
        <p>Сначала указана клетка, затем доступные направления робота. Выбор завершится до раздачи карт.</p>
        <div className="reentry-options">{reentry.candidates.map((candidate, index) => <div className="reentry-option" key={`${candidate.x},${candidate.y}`}>
            <strong>{candidate.archive ? "Архив" : `Клетка ${index + 1}`}</strong>
            <span>{candidate.directions.map((direction) => <button className="direction-choice" key={direction}
                title={`Направление: ${direction}`} onClick={() => app.socket.emit("choose-reentry", {x: candidate.x, y: candidate.y, direction})}>
                {arrows[direction]}
            </button>)}</span>
        </div>)}</div>
    </section>;
}

class Game extends React.Component {
    constructor() {
        super();
        const storedScale = Number(localStorage.getItem("roborally-board-scale"));
        const boardScale = Number.isInteger(storedScale) && storedScale >= 30 && storedScale <= 200 && storedScale % 10 === 0
            ? storedScale : 50;
        this.state = {inited: false, phase: "loading", playerNames: {}, playerSlots: [], robots: [], log: [], flags: [],
            boardScale, boardPanX: 0, boardPanY: 0, boardPanMode: false};
        this.privateState = {hand: [], selected: [], locked: false};
    }

    setBoardScale(boardScale) {
        const normalized = Math.max(30, Math.min(200, Math.round(boardScale / 10) * 10));
        localStorage.setItem("roborally-board-scale", String(normalized));
        this.setState({boardScale: normalized, boardPanX: 0, boardPanY: 0});
    }

    resetBoardPosition() {
        this.boardPanDrag = null;
        this.setState({boardPanX: 0, boardPanY: 0, boardPanning: false});
    }

    resetBoardView() {
        localStorage.setItem("roborally-board-scale", "50");
        this.setState({boardScale: 50, boardPanX: 0, boardPanY: 0, boardPanMode: false});
    }

    beginBoardPan(event) {
        if (!this.state.boardPanMode || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        this.boardPanDrag = {pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            panX: this.state.boardPanX, panY: this.state.boardPanY};
        this.setState({boardPanning: true});
    }

    moveBoardPan(event) {
        const drag = this.boardPanDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        const viewport = event.currentTarget;
        const canvas = viewport.querySelector(".board-wrap");
        const width = viewport.clientWidth;
        const height = viewport.clientHeight;
        const canvasWidth = canvas.offsetWidth;
        const canvasHeight = canvas.offsetHeight;
        // Deliberately allow empty space around the board at every zoom level,
        // but keep a visible edge so the board cannot be lost completely.
        const clamp = (value, size, canvasSize) => {
            const visibleEdge = Math.min(80, Math.max(24, Math.min(width, height) * .15));
            return Math.max(visibleEdge - canvasSize, Math.min(size - visibleEdge, value));
        };
        this.setState({
            boardPanX: clamp(drag.panX + event.clientX - drag.x, width, canvasWidth),
            boardPanY: clamp(drag.panY + event.clientY - drag.y, height, canvasHeight)
        });
    }

    endBoardPan(event) {
        if (!this.boardPanDrag || this.boardPanDrag.pointerId !== event.pointerId) return;
        this.boardPanDrag = null;
        this.setState({boardPanning: false});
    }

    componentDidMount() {
        const initArgs = CommonRoom.roomInit(this);
        this.socket.on("state", (state) => this.setState({...state, userId: this.userId, inited: true}));
        this.socket.on("player-state", (playerState) => {
            this.privateState = playerState;
            this.forceUpdate();
        });
        this.socket.on("message", (message) => alert(message));
        this.socket.emit("init", initArgs);
    }

    render() {
        const state = this.state;
        if (!state.inited) return <main className="loading">Подключение к цеху RoboRally…</main>;
        return <main className="roborally-app">
            <header>
                <div><h1>RoboRally</h1><p>Комната {state.roomId} · {state.phase === "programming" ? "программирование" : state.phase === "resolving" ? "исполнение" : state.phase === "reentry" ? "возрождение" : state.phase === "finished" ? "финиш" : "лобби"}</p></div>
                {state.userId === state.hostId && state.phase !== "lobby" ? <button onClick={() => this.socket.emit("restart-game")}>В лобби</button> : null}
            </header>
            {state.phase === "lobby" ? <Lobby state={state} app={this}/> : <>
                <section className="game-layout">
                    <div className="board-column">
                        <div className={`board-viewport ${state.boardPanMode ? "pan-enabled" : ""} ${state.boardPanning ? "panning" : ""}`}
                            style={{width: `${Math.min(state.boardScale, 100)}%`}}
                            onPointerDown={(event) => this.beginBoardPan(event)} onPointerMove={(event) => this.moveBoardPan(event)}
                            onPointerUp={(event) => this.endBoardPan(event)} onPointerCancel={(event) => this.endBoardPan(event)}>
                        <div className="board-wrap" style={{width: `${state.boardScale > 100 ? state.boardScale : 100}%`,
                            transform: `translate(${state.boardPanX}px, ${state.boardPanY}px)`}}>
                            <div className="board" aria-label={`Игровое поле ${state.board.name}`}>
                            <img className="factory-card" draggable="false" style={{transform: `rotate(${state.course.rotation || 0}deg)`}}
                                src={`/roborally/materials/${encodeURIComponent("Поля целиком")}/${encodeURIComponent(state.boardCards[state.board.name])}`} />
                            <img className="start-card" draggable="false" src={`/roborally/materials/${encodeURIComponent("Поля целиком")}/${encodeURIComponent(state.board.start)}`} />
                            <div className="board-overlay" aria-hidden="true">
                                {state.flags.map((flag) => <div className="flag" key={flag.number}
                                    style={{gridColumn: `${flag.x + 1} / ${flag.x + 2}`, gridRow: `${flag.y + 1} / ${flag.y + 2}`}}>
                                    <span className="flag-cloth">{flag.number}</span><span className="flag-wrench"></span>
                                </div>)}
                                {state.robots.filter((robot) => robot.archive && !robot.eliminated).map((robot) => <div className="archive-marker"
                                    key={`archive-${robot.userId}`} style={{left: `${robot.archive.x / 12 * 100 + .8}%`, top: `${robot.archive.y / 16 * 100 + .6}%`, background: robot.color}}
                                    title={`Архив: ${state.playerNames[robot.userId]}`}>⚙</div>)}
                                {state.phase === "reentry" && this.privateState.reentry && this.privateState.reentry.active ? this.privateState.reentry.candidates.map((candidate, index) =>
                                    <div className="reentry-cell-marker" key={`reentry-${candidate.x}-${candidate.y}`}
                                        style={{gridColumn: `${candidate.x + 1} / ${candidate.x + 2}`, gridRow: `${candidate.y + 1} / ${candidate.y + 2}`}}>
                                        {candidate.archive ? "A" : index + 1}
                                    </div>) : null}
                                {state.robots.map((robot) => <Robot key={robot.userId} robot={robot} names={state.playerNames}/>)}</div>
                            </div>
                        </div>
                        </div>
                        <div className="board-toolbar panel" aria-label="Масштаб игрового поля">
                            <button type="button" title="Уменьшить поле" aria-label="Уменьшить поле"
                                disabled={state.boardScale <= 30} onClick={() => this.setBoardScale(state.boardScale - 10)}>−</button>
                            <span>{state.boardScale}%</span>
                            <button type="button" title="Увеличить поле" aria-label="Увеличить поле"
                                disabled={state.boardScale >= 200} onClick={() => this.setBoardScale(state.boardScale + 10)}>+</button>
                            <button type="button" className={`board-pan-toggle ${state.boardPanMode ? "active" : ""}`}
                                title="Переключить режим перемещения поля" aria-label="Перемещать поле"
                                aria-pressed={state.boardPanMode} onClick={() => this.setState({boardPanMode: !state.boardPanMode})}>✥</button>
                            <button type="button" className="board-position-reset" title="Вернуть поле в исходную позицию, сохранив масштаб"
                                aria-label="Сбросить позицию поля" onClick={() => this.resetBoardPosition()}>⌂</button>
                            <button type="button" className="board-reset" title="Сбросить масштаб и позицию"
                                aria-label="Сбросить вид поля" onClick={() => this.resetBoardView()}>↺</button>
                        </div>
                    </div>
                    <aside>
                        <PlayerPanel state={state}/>
                        <FieldGuide/>
                        <section className="panel log"><h2>Системный журнал</h2>{state.log.map((item, index) => <p key={index}>{item}</p>)}</section>
                        {state.phase === "resolving" ? <section className="panel stage"><h2>Сейчас</h2><p>{state.stage}</p></section> : null}
                    </aside>
                    <Program state={state} privateState={this.privateState} app={this}/>
                </section>
                <ReentryPanel state={state} privateState={this.privateState} app={this}/>
                <PublicPrograms state={state}/>
                {state.phase === "finished" ? <section className="winner panel"><h2>Победитель: {state.playerNames[state.winnerId]}</h2><p>Все контрольные флаги активированы.</p></section> : null}
            </>}
        </main>;
    }
}

ReactDOM.render(<Game/>, document.getElementById("root"));
