const DIRECTION_ANGLES = {north: 0, east: 90, south: 180, west: 270};
const FIELD_VECTORS = {north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0]};
const OPPOSITE_DIRECTION = {north: "south", east: "west", south: "north", west: "east"};
const DIRECTION_NAMES = {north: "вверх", east: "вправо", south: "вниз", west: "влево"};
const LOBBY_ROBOT_COLORS = ["#f04444", "#2d82ff", "#ffd23f", "#27c56d", "#b66dff", "#ff8b38", "#32c8cb", "#f26bb4"];

function boardImageUrl(state, board) {
    return state.boardImages[board];
}

function startImageUrl(state, start) {
    const index = state.startCards.indexOf(start);
    return state.startImages[start] || Object.values(state.startImages)[index];
}

function keyPoint(key) {
    return key.split(",").map(Number);
}

function connectedGroups(keys, connects) {
    const remaining = new Set(keys);
    const groups = [];
    while (remaining.size) {
        const first = remaining.values().next().value;
        const group = [];
        const queue = [first];
        remaining.delete(first);
        while (queue.length) {
            const key = queue.pop();
            group.push(key);
            const [x, y] = keyPoint(key);
            [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy]) => {
                const neighbor = `${x + dx},${y + dy}`;
                if (remaining.has(neighbor) && (!connects || connects(key, neighbor))) {
                    remaining.delete(neighbor);
                    queue.push(neighbor);
                }
            });
        }
        groups.push(group);
    }
    return groups;
}

function cellOutline(cells) {
    const set = new Set(cells);
    const parts = [];
    cells.forEach((key) => {
        const [x, y] = keyPoint(key);
        if (!set.has(`${x},${y - 1}`)) parts.push(`M${x},${y}H${x + 1}`);
        if (!set.has(`${x + 1},${y}`)) parts.push(`M${x + 1},${y}V${y + 1}`);
        if (!set.has(`${x},${y + 1}`)) parts.push(`M${x + 1},${y + 1}H${x}`);
        if (!set.has(`${x - 1},${y}`)) parts.push(`M${x},${y + 1}V${y}`);
    });
    return parts.join("");
}

function wallLine(x, y, direction) {
    if (direction === "north") return [x, y, x + 1, y];
    if (direction === "east") return [x + 1, y, x + 1, y + 1];
    if (direction === "south") return [x, y + 1, x + 1, y + 1];
    return [x, y, x, y + 1];
}

function corridorPoints([x1, y1, x2, y2], width = .28, bounds = null) {
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const px = -(y2 - y1) / length * width / 2;
    const py = (x2 - x1) / length * width / 2;
    const points = [[x1 + px,y1 + py],[x2 + px,y2 + py],[x2 - px,y2 - py],[x1 - px,y1 - py]];
    if (bounds) {
        const xs=points.map((point)=>point[0]), ys=points.map((point)=>point[1]);
        const shiftX=Math.min(0,bounds.width-Math.max(...xs))-Math.min(0,Math.min(...xs));
        const shiftY=Math.min(0,bounds.height-Math.max(...ys))-Math.min(0,Math.min(...ys));
        points.forEach((point)=>{point[0]+=shiftX;point[1]+=shiftY;});
    }
    return points.map((point)=>point.join(",")).join(" ");
}

function pusherPanel(pusher) {
    if (pusher.direction === "east") return {x: pusher.x, y: pusher.y + .08, width: .42, height: .84};
    if (pusher.direction === "west") return {x: pusher.x + .58, y: pusher.y + .08, width: .42, height: .84};
    if (pusher.direction === "south") return {x: pusher.x + .08, y: pusher.y, width: .84, height: .42};
    return {x: pusher.x + .08, y: pusher.y + .58, width: .84, height: .42};
}

function physicalWallId(wall) {
    const [xText, yText, direction] = wall.split(",");
    const x = Number(xText), y = Number(yText);
    if (direction === "north") return `h,${x},${y}`;
    if (direction === "south") return `h,${x},${y + 1}`;
    if (direction === "west") return `v,${x},${y}`;
    return `v,${x + 1},${y}`;
}

function laserLines(laser, walls) {
    const vector = FIELD_VECTORS[laser.direction];
    const hasWall = (x, y, direction) => {
        if (walls.has(`${x},${y},${direction}`)) return true;
        const [dx, dy] = FIELD_VECTORS[direction];
        return walls.has(`${x + dx},${y + dy},${OPPOSITE_DIRECTION[direction]}`);
    };
    let x = laser.x, y = laser.y;
    const start = [x + .5 - vector[0] * .5, y + .5 - vector[1] * .5];
    let end = [x + .5 + vector[0] * .5, y + .5 + vector[1] * .5];
    while (x >= 0 && x < 12 && y >= 0 && y < 16) {
        end = [x + .5 + vector[0] * .5, y + .5 + vector[1] * .5];
        if (hasWall(x, y, laser.direction)) break;
        const nx = x + vector[0], ny = y + vector[1];
        if (nx < 0 || nx >= 12 || ny < 0 || ny >= 16) break;
        x = nx; y = ny;
    }
    const offsets = (laser.count || 1) === 3 ? [-.27, 0, .27] : (laser.count || 1) === 2 ? [-.22, .22] : [0];
    return offsets.map((offset) => vector[0]
        ? [[start[0], start[1] + offset], [end[0], end[1] + offset]]
        : [[start[0] + offset, start[1]], [end[0] + offset, end[1]]]);
}

class BoardHints extends React.Component {
    constructor(props) {
        super(props);
        this.state = {hovered: null, x: 50, y: 50};
    }

    point(event) {
        const svg = event.currentTarget.ownerSVGElement;
        const rect = svg.getBoundingClientRect();
        return {x: Math.max(2, Math.min(98, (event.clientX - rect.left) / rect.width * 100)),
            y: Math.max(2, Math.min(98, (event.clientY - rect.top) / rect.height * 100))};
    }

    show(event, item) {
        this.setState({hovered: item, ...this.point(event)});
    }

    move(event) {
        if (this.state.hovered) this.setState(this.point(event));
    }

    componentDidUpdate(previousProps) {
        if (previousProps.enabled && !this.props.enabled && this.state.hovered)
            this.setState({hovered: null});
    }

    render() {
        const {state, enabled} = this.props;
        const features = state.fieldFeatures || {pits: [], repairs: [], gears: {}, starts: [], conveyors: {}, express: [], walls: [], lasers: [], pushers: []};
        const items = [];
        const express = new Set(features.express || []);
        const conveyorDirections = features.conveyors || {};
        const hintConnections = new Set((features.hintConnections || []).map((connection) => connection.split("|").sort().join("|")));
        const conveyorGroups = connectedGroups(Object.keys(conveyorDirections), (left, right) => {
            const [lx, ly] = keyPoint(left);
            const [rx, ry] = keyPoint(right);
            const flowsTo = (from, toX, toY) => {
                const [fx, fy] = keyPoint(from);
                const vector = FIELD_VECTORS[conveyorDirections[from]];
                return vector && fx + vector[0] === toX && fy + vector[1] === toY;
            };
            return flowsTo(left, rx, ry) || flowsTo(right, lx, ly) || hintConnections.has([left, right].sort().join("|"));
        });
        conveyorGroups.forEach((cells, index) => {
            const outline = cellOutline(cells);
            cells.forEach((key) => {
                const isExpress = express.has(key);
                items.push({id: `conveyor-${index}-${key}`, kind: "area", cells: [key], highlightCells: cells, outline,
                    title: isExpress ? "Экспресс-конвейер" : "Конвейер",
                    description: isExpress ? "Двигает на 2 клетки. Фазы 3 и 4." : "Двигает на 1 клетку. Фаза 4."});
            });
        });
        connectedGroups(features.pits || []).forEach((cells, index) => items.push({id: `pit-${index}`, kind: "area", cells,
            outline: cellOutline(cells), title: "Яма", description: "Сразу уничтожает попавшего сюда робота."}));
        Object.entries(features.gears || {}).forEach(([key, turn], index) => items.push({id: `gear-${index}`, kind: "cell", key,
            title: "Шестерня", description: `Поворачивает робота на 90° ${turn > 0 ? "вправо" : "влево"}. Фаза 6.`}));
        (features.repairs || []).forEach((key, index) => items.push({id: `repair-${index}`, kind: "cell", key,
            title: "Ремонтный ключ", description: "Создаёт архив; после регистра 5 снимает 1 повреждение. Фаза 8."}));

        const walls = new Set(features.walls || []);
        (features.lasers || []).forEach((laser, index) => {
            const count = laser.count || 1;
            items.push({id: `laser-${index}`, kind: "multi-line", lines: laserLines(laser, walls), title: count > 1 ? `Лазер ×${count}` : "Лазер",
                description: `Наносит ${count} ${count === 1 ? "повреждение" : "повреждения"}; стену и первого робота не пробивает. Фаза 7.`});
        });
        const uniqueWalls = [...new Map((features.walls || []).map((wall) => [physicalWallId(wall), wall])).values()];
        uniqueWalls.forEach((wall, index) => {
            const [x, y, direction] = wall.split(",");
            items.push({id: `wall-${index}`, kind: "edge", line: wallLine(Number(x), Number(y), direction),
                title: "Стена", description: "Блокирует движение, толкание и лазеры."});
        });
        (features.pushers || []).forEach((pusher, index) => items.push({id: `pusher-${index}`, kind: "pusher", panel: pusherPanel(pusher), title: "Толкатель",
            description: `Толкает на 1 клетку ${DIRECTION_NAMES[pusher.direction]}. Регистры ${(pusher.active || []).join(", ")}. Фаза 5.`}));
        (features.starts || []).forEach((start) => items.push({id: `start-${start.slot}`, kind: "cell", key: `${start.x},${start.y}`,
            title: `Стартовая позиция ${start.slot}`, description: "Исходная позиция робота с этим номером."}));
        (state.flags || []).filter((flag) => flag.x != null && flag.y != null).forEach((flag) => items.push({id: `flag-${flag.number}`, kind: "circle", x: flag.x + .5, y: flag.y + .5, r: .42,
            title: `Флаг ${flag.number}`, description: "Берётся по порядку; создаёт архив и ремонтирует после регистра 5. Фаза 8."}));
        (state.robots || []).filter((robot) => robot.archive && !robot.eliminated).forEach((robot) => items.push({id: `archive-${robot.userId}`,
            kind: "corner", x: robot.archive.x + .096, y: robot.archive.y + .096, title: "Архивная точка",
            description: `Точка возрождения: ${state.playerNames[robot.userId] || robot.userId}${robot.userId === state.userId ? " (вы)" : ""}.`}));
        (state.robots || []).filter((robot) => robot.x != null && robot.y != null).forEach((robot) => items.push({id: `robot-${robot.userId}`,
            kind: "circle", x: robot.x + .5, y: robot.y + .5, r: .33, title: "Робот",
            description: `${state.playerNames[robot.userId] || robot.userId}${robot.userId === state.userId ? " (вы)" : ""}. Направление: ${DIRECTION_NAMES[robot.direction]}. ${(((state.playerStats || {})[robot.userId]) || {}).poweredDown ? "Power Down: не стреляет." : "Стреляет в фазе 7."}`}));

        const hovered = enabled && this.state.hovered && items.find((item) => item.id === this.state.hovered.id);
        const draw = (item, hit) => {
            const common = hit ? {className: "field-hint-hit", "data-hint-id": item.id, onPointerEnter: (event) => this.show(event, item),
                onPointerMove: (event) => this.move(event), onPointerLeave: () => this.setState({hovered: null})} : {className: "field-hint-outline"};
            if (item.kind === "area") return hit
                ? <g key={`${item.id}-hit`}>{item.cells.map((key) => { const [x,y] = keyPoint(key); return <rect {...common} key={key} x={x} y={y} width="1" height="1"/>; })}</g>
                : <g key={`${item.id}-outline`}><g className="field-hint-wash">{(item.highlightCells || item.cells).map((key) => {
                    const [x,y] = keyPoint(key); return <rect key={key} x={x} y={y} width="1" height="1"/>;
                })}</g><path {...common} d={item.outline}/></g>;
            if (item.kind === "cell") { const [x,y] = keyPoint(item.key); return <rect {...common} key={`${item.id}-${hit}`} x={x + .04} y={y + .04} width=".92" height=".92" rx=".08"/>; }
            if (item.kind === "multi-line") {
                return <g key={`${item.id}-${hit}`}>{item.lines.map((line, index) => hit
                    ? <polygon {...common} key={index} points={corridorPoints([...line[0], ...line[1]], .16)}/>
                    : <line {...common} key={index} x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]}/>)}</g>;
            }
            if (item.kind === "edge") return hit
                ? <polygon {...common} key={`${item.id}-hit`} points={corridorPoints(item.line, .34, {width: 12, height: 16})}/>
                : <line {...common} key={`${item.id}-outline`} x1={item.line[0]} y1={item.line[1]} x2={item.line[2]} y2={item.line[3]}/>;
            if (item.kind === "pusher") return <rect {...common} key={`${item.id}-${hit}`} {...item.panel} rx=".06"/>;
            if (item.kind === "corner") return <rect {...common} key={`${item.id}-${hit}`} x={item.x} y={item.y} width=".258" height=".258" rx=".04"/>;
            return <circle {...common} key={`${item.id}-${hit}`} cx={item.x} cy={item.y} r={item.r}/>;
        };
        const tooltipLeft = this.state.x > 68;
        const tooltipAbove = this.state.y > 78;
        return <div className={`board-hints ${enabled ? "enabled" : "disabled"}`}>
            <svg viewBox="0 0 12 16" preserveAspectRatio="none" aria-hidden="true">
                {hovered ? draw(hovered, false) : null}
                {items.map((item) => draw(item, true))}
            </svg>
            {enabled && hovered ? <div className={`field-tooltip ${tooltipLeft ? "to-left" : ""} ${tooltipAbove ? "above" : ""}`}
                style={{left: `${this.state.x}%`, top: `${this.state.y}%`}} role="tooltip">
                <strong>{hovered.title}</strong><span>{hovered.description}</span>
            </div> : null}
        </div>;
    }
}

function Robot({robot, names, ownUserId}) {
    if (robot.x == null || robot.y == null) return null;
    const style = {
        left: `${(robot.x + .5) / 12 * 100}%`,
        top: `${(robot.y + .5) / 16 * 100}%`,
        "--robot-color": robot.color,
        "--robot-angle": `${Number.isFinite(robot.headingTurns) ? robot.headingTurns * 90 : DIRECTION_ANGLES[robot.direction]}deg`
    };
    return <div className={`robot ${robot.userId === ownUserId ? "own-robot" : ""} ${robot.eliminated ? "eliminated" : ""}`} style={style} data-user-id={robot.userId}
                title={`${names[robot.userId] || robot.userId}: ${robot.x + 1}, ${robot.y + 1}`}>
        <span className="robot-heading"><svg viewBox="0 0 100 100" aria-hidden="true">
            <path d="M50 5 93 48H68V92H32V48H7Z"/>
        </svg></span>
    </div>;
}

function RobotDeath({robot}) {
    if (!robot.death || robot.death.x == null || robot.death.y == null) return null;
    const style = {left: `${(robot.death.x + .5) / 12 * 100}%`, top: `${(robot.death.y + .5) / 16 * 100}%`,
        "--death-color": robot.color};
    return <div className="robot-death" style={style} aria-hidden="true">
        <svg className="robot-death-icon" viewBox="0 0 100 100">
            <path className="death-burst" d="M50 4 61 22 82 14 78 36 98 49 78 62 85 85 62 79 50 98 38 79 15 85 22 62 2 49 22 36 18 14 39 22Z"/>
            <path className="death-skull" d="M28 47c0-14 9-24 22-24s22 10 22 24c0 9-4 15-11 19v11H39V66c-7-4-11-10-11-19Z"/>
            <circle cx="41" cy="48" r="6"/><circle cx="59" cy="48" r="6"/>
            <path className="death-teeth" d="M42 67v10m8-10v10m8-10v10"/>
        </svg>
        {[0,1,2,3,4,5].map((fragment) => <i key={fragment} style={{"--fragment": fragment}}></i>)}
    </div>;
}

function BoardEventIcon({event}) {
    const iconStyle = {"--event-angle": `${DIRECTION_ANGLES[event.direction] || 0}deg`};
    if (event.type === "heal") return <svg className="board-event-icon" data-icon="heal" viewBox="0 0 100 100">
        <path d="M65 15a20 20 0 0 0-19 27L18 70a10 10 0 1 0 14 14l28-28a20 20 0 0 0 27-19L73 48 53 28Z"/>
        <path className="event-accent" d="M25 16v22M14 27h22"/>
    </svg>;
    if (event.type === "flag") return <svg className="board-event-icon" data-icon="flag" viewBox="0 0 100 100">
        <path d="M27 88V13m2 5h48L65 35l12 18H29"/>
        <path className="event-accent" d="m40 67 9 9 20-23"/>
    </svg>;
    if (event.type === "archive") return <svg className="board-event-icon" data-icon="archive" viewBox="0 0 100 100">
        <path d="M50 91S22 64 22 40a28 28 0 1 1 56 0c0 24-28 51-28 51Z"/>
        <circle className="event-accent" cx="50" cy="40" r="12"/>
    </svg>;
    if (event.type === "gear") return <svg className="board-event-icon" data-icon="gear" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="24"/><circle cx="50" cy="50" r="8"/>
        <path d="M50 12v14m0 48v14M12 50h14m48 0h14M23 23l10 10m34 34 10 10M77 23 67 33M33 67 23 77"/>
        <path className="event-accent" d={event.turn > 0 ? "M20 42A32 32 0 0 1 75 27m0 0-2-14m2 14-14 2"
            : "M80 42A32 32 0 0 0 25 27m0 0 2-14m-2 14 14 2"}/>
    </svg>;
    if (event.type === "conveyor") return <svg className="board-event-icon directional" data-icon="conveyor" style={iconStyle} viewBox="0 0 100 100">
        <rect x="22" y="8" width="56" height="84" rx="20"/>
        {event.turn ? <path className="event-accent" d={event.turn > 0
            ? "M35 72V48c0-13 8-21 21-21h15m-10-10 10 10-10 10"
            : "M65 72V48c0-13-8-21-21-21H29m10-10L29 27l10 10"}/>
            : <><path className="event-accent" d="M50 76V24m-12 13 12-13 12 13"/>
                {event.express ? <path className="event-accent express-mark" d="m38 59 12-13 12 13"/> : null}</>}
    </svg>;
    if (event.type === "pusher") return <svg className="board-event-icon directional" data-icon="pusher" style={iconStyle} viewBox="0 0 100 100">
        <path d="M22 82h56M29 69h42M38 69V48h24v21M50 48V15m-14 16 14-16 14 16"/>
    </svg>;
    return <svg className="board-event-icon directional" data-icon="push" style={iconStyle} viewBox="0 0 100 100">
        <path d="M50 80V19m-17 18 17-18 17 18M20 73h60"/>
        <path className="event-accent" d="m14 57 10-6-8-8 12-2-4-10m62 26-10-6 8-8-12-2 4-10"/>
    </svg>;
}

function BoardEvents({events = []}) {
    if (!events.length) return null;
    return <div className="board-events-layer" aria-hidden="true">{events.map((event) => {
        const [dx,dy] = FIELD_VECTORS[event.direction] || [0,0];
        return <span className={`board-event board-event-${event.type} ${event.turn > 0 ? "turn-right" : event.turn < 0 ? "turn-left" : ""}`}
            key={event.id} data-event-id={event.id} data-user-id={event.userId}
            style={{left: `${(event.x + .5) / 12 * 100}%`, top: `${(event.y + .5) / 16 * 100}%`,
                "--event-color": event.color || "#8ddcff", "--event-dx": `${-dx * 2.2}cqw`, "--event-dy": `${-dy * 2.2}cqw`}}>
            <BoardEventIcon event={event}/>
        </span>;
    })}</div>;
}

function LaserEffects({shots = [], robots = []}) {
    if (!shots.length) return null;
    const robotsByUser = Object.fromEntries(robots.map((robot) => [robot.userId, robot]));
    // A robot beam is valid only while its real source robot occupies the
    // recorded square. This also rejects stale network frames instead of
    // drawing a beam from an empty conveyor or another arbitrary cell.
    const visibleShots = shots.filter((shot) => {
        if (shot.source !== "robot") return true;
        const robot = robotsByUser[shot.sourceUserId];
        return robot && !robot.eliminated && !robot.destroyed && robot.x != null && robot.y != null
            && Math.abs(shot.start.x - (robot.x + .5)) < .001
            && Math.abs(shot.start.y - (robot.y + .5)) < .001
            && shot.direction === robot.direction;
    });
    const hits = new Map();
    visibleShots.filter((shot) => shot.targetUserId).forEach((shot) => {
        const hit = hits.get(shot.targetUserId) || {x: shot.end.x, y: shot.end.y, damage: 0};
        hit.damage += shot.count || 1;
        hits.set(shot.targetUserId, hit);
    });
    const beamLines = (shot) => {
        const [dx, dy] = FIELD_VECTORS[shot.direction] || [0, -1];
        const offsets = shot.count === 3 ? [-.24, 0, .24] : shot.count === 2 ? [-.18, .18] : [0];
        return offsets.map((offset) => ({
            x1: shot.start.x + (dy ? offset : 0), y1: shot.start.y + (dx ? offset : 0),
            x2: shot.end.x + (dy ? offset : 0), y2: shot.end.y + (dx ? offset : 0)
        }));
    };
    return <svg className="laser-effects" viewBox="0 0 12 16" preserveAspectRatio="none" aria-hidden="true">
        {visibleShots.map((shot) => {
            return <g className={`laser-shot laser-shot-${shot.source}`} data-source-user-id={shot.sourceUserId || undefined} key={shot.id}>
                {beamLines(shot).map((line, index) => <React.Fragment key={index}>
                    <line className="laser-beam-glow" pathLength="1" {...line}/>
                    <line className="laser-beam-core" pathLength="1" {...line}/>
                </React.Fragment>)}
                <circle className="laser-muzzle" cx={shot.start.x} cy={shot.start.y} r=".16"/>
            </g>;
        })}
        {[...hits.entries()].map(([userId, hit]) => <g className="laser-impact" key={userId}
            style={{"--impact-color": (robotsByUser[userId] || {}).color || "#ffcf4a"}}>
            <circle className="laser-impact-ring" cx={hit.x} cy={hit.y} r=".38"/>
            <circle className="laser-impact-flash" cx={hit.x} cy={hit.y} r=".2"/>
            <text x={hit.x} y={hit.y - .42} textAnchor="middle">−{hit.damage}</text>
        </g>)}
    </svg>;
}

function PlayerPanel({state}) {
    const robotsByUser = {};
    state.robots.forEach((robot) => robotsByUser[robot.userId] = robot);
    return <section className="players-panel panel">
        <h2>Роботы</h2>
        {state.playerSlots.filter(Boolean).map((userId) => {
            const robot = robotsByUser[userId] || {};
            const stats = (state.playerStats && state.playerStats[userId]) || {};
            const status = stats.poweredDown ? "powered-down"
                : stats.powerDownNextRound ? "power-down-next"
                : state.phase === "programming" && stats.ready ? "ready" : "";
            const statusTitle = status === "powered-down" ? "Робот находится в Power Down"
                : status === "power-down-next" ? "Робот отключится в следующем раунде"
                : status === "ready" ? "Игрок закончил программирование" : "";
            return <div className="player-row" key={userId}>
                <i style={{background: robot.color}}></i>
                <span className={`${userId === state.userId ? "own-player-name" : "player-name"} player-name-status ${status}`}
                    title={statusTitle || undefined}>{state.playerNames[userId]}</span>
                <span>⚑ {stats.checkpoints || 0}/{state.flags.length}</span>
                <span>⚡ {stats.damage || 0}</span>
                <span>♥ {stats.lives == null ? 0 : stats.lives}</span>
                {stats.poweredDown ? <small>POWER DOWN</small> : stats.powerDownNextRound ? <small>POWER DOWN · следующий раунд</small> : null}
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
            <dt>Таймер программирования</dt><dd>Когда готовые программы сдали все игроки, кроме одного, у последнего остаётся 30 секунд. По истечении времени пустые регистры случайно заполняются оставшимися картами с руки и блокируются.</dd>
            <dt>Power Down</dt><dd>Повреждённый робот тайно объявляет отключение на следующий раунд вместе с программой, но текущий ход выполняет полностью. В отключённом раунде он сбрасывает урон, не получает карты и не стреляет, но поле и другие роботы продолжают на него воздействовать. После раунда отключённые игроки одновременно решают, проснуться или продолжить; новый урон при пробуждении сохраняется, а при 5–9 повреждениях блокирует регистры открытыми случайными картами.</dd>
            <dt>Возрождение</dt><dd>Происходит до раздачи карт: на свободном архиве можно выбрать любое направление; при занятом архиве выбирается допустимая соседняя клетка и направление.</dd>
            <dt>Яма/край</dt><dd>Уничтожение, потеря жизни, возврат на архив с 2 повреждениями.</dd>
        </dl>
    </details>;
}

function CourseSpecialRules({course}) {
    if (!course || !course.specialRules) return null;
    return <section className="panel active-special-rules"><h2>Special Rules · {course.name}</h2>
        <p>{course.specialRules.description}</p></section>;
}

class Lobby extends React.Component {
    constructor(props) {
        super(props);
        this.state = {nickname: props.state.playerNames[props.state.userId] || ""};
    }

    saveNickname() {
        const nickname = this.state.nickname.trim();
        if (nickname) this.props.app.socket.emit("set-nickname", nickname);
    }

    joinGame() {
        this.props.app.socket.emit("join-game", {nickname: this.state.nickname.trim()});
    }

    render() {
        const {state, app} = this.props;
        const players = state.playerSlots.filter(Boolean);
        const online = state.onlinePlayers || [];
        const spectators = online.filter((userId) => !players.includes(userId));
        const isPlayer = players.includes(state.userId);
        const isHost = state.userId === state.hostId;
        const playerCount = players.length;
        const playerColors = state.playerColors || {};
        const robotColors = state.robotColors || LOBBY_ROBOT_COLORS;
        const colorFor = (userId) => playerColors[userId] || robotColors[Math.max(0, state.playerSlots.indexOf(userId))];
        const canStart = playerCount >= 2 && playerCount >= state.course.min && playerCount <= state.course.max;
        const usedColors = new Set(players.filter((userId) => userId !== state.userId)
            .map(colorFor));
        return <section className="lobby-shell lobby">
            <section className="lobby-intro panel">
                <div><h2>Лобби · комната {state.roomId}</h2>
                    <p>Сначала вы находитесь среди зрителей. До начала партии роль можно менять свободно.</p></div>
                <label className="nickname-field">Ваш никнейм
                    <span><input maxLength="40" value={this.state.nickname}
                        onChange={(event) => this.setState({nickname: event.target.value})}
                        onKeyDown={(event) => event.key === "Enter" && this.saveNickname()}/>
                    <button type="button" onClick={() => this.saveNickname()}>Сохранить</button></span>
                </label>
                <div className="role-actions">
                    <button className={isPlayer ? "primary" : ""} disabled={isPlayer || playerCount >= 8}
                        onClick={() => this.joinGame()}>
                        {isPlayer ? "Вы присоединились ✓" : "Присоединиться к игре"}</button>
                    <button className={!isPlayer ? "primary" : ""} disabled={!isPlayer}
                        onClick={() => app.socket.emit("spectators-join")}>Остаться зрителем</button>
                </div>
            </section>
            <section className="lobby-members panel">
                <div className="member-column"><h3>Игроки <small>{playerCount}/8</small></h3>
                    {players.length ? players.map((userId) => <div className="lobby-member" key={userId}>
                        <i style={{background: colorFor(userId)}}></i>
                        <span>{state.playerNames[userId]} {userId === state.hostId ? <small>хост</small> : null}</span>
                        <em>старт {((state.startAssignments || {})[userId] ?? 0) + 1}</em>
                        {userId === state.userId ? <b>вы</b> : null}
                    </div>) : <p className="empty-members">Пока никто не присоединился.</p>}
                </div>
                <div className="member-column"><h3>Зрители <small>{spectators.length}</small></h3>
                    {spectators.length ? spectators.map((userId) => <div className="lobby-member spectator" key={userId}>
                        <span>{state.playerNames[userId]} {userId === state.hostId ? <small>хост</small> : null}</span>
                        {userId === state.userId ? <b>вы</b> : null}
                    </div>) : <p className="empty-members">Нет зрителей.</p>}
                </div>
                {isPlayer ? <div className="color-picker"><h3>Цвет вашего робота</h3>
                    <div>{robotColors.map((color) => <button type="button" key={color}
                        className={colorFor(state.userId) === color ? "selected" : ""}
                        style={{"--swatch": color}} disabled={usedColors.has(color)}
                        title={usedColors.has(color) ? "Цвет занят" : "Выбрать цвет"}
                        aria-label={`Цвет ${color}`} onClick={() => app.socket.emit("select-color", color)}></button>)}</div>
                </div> : null}
            </section>
            <CourseSetup state={state} app={app} playerCount={playerCount} readOnly={!isHost}/>
            <section className="lobby-start panel">
                {isHost ? <><button className="primary" disabled={!canStart} onClick={() => app.socket.emit("start-game")}>Начать игру</button>
                    {!canStart ? <p>Для курса «{state.course.name}» требуется игроков: {state.course.players}.</p> : <p>Курс и состав готовы.</p>}</>
                    : <p>Хост начнёт игру, когда на выбранном курсе будет достаточно игроков.</p>}
            </section>
        </section>;
    }
}

function CourseFieldContents({course, state, flagClassName, showLobbyRobots = false}) {
    const assignments = state.startAssignments || {};
    const startPositions = state.startPositions || [];
    const players = (state.playerSlots || []).filter(Boolean);
    return <React.Fragment>
        <img className="course-thumbnail-factory" draggable="false" style={{transform: `rotate(${course.rotation || 0}deg)`}}
            src={boardImageUrl(state, course.board)}/>
        <img className="course-thumbnail-start" draggable="false"
            src={startImageUrl(state, course.start || state.startCards[1])}/>
        {(course.flags || []).map(([x, y], index) => <i className={flagClassName || ""} key={`${x}-${y}-${index}`}
            style={{left: `${(x + .5) / 12 * 100}%`, top: `${(y + .5) / 16 * 100}%`}}>{index + 1}</i>)}
        {showLobbyRobots ? players.map((userId) => {
            const start = assignments[userId];
            const position = startPositions[start];
            if (!position) return null;
            const color = (state.playerColors || {})[userId] || (state.robotColors || LOBBY_ROBOT_COLORS)[start];
            return <span className="course-preview-robot" data-start={start + 1} data-user-id={userId} key={userId}
                title={`${state.playerNames[userId] || userId}: старт ${start + 1}`}
                style={{left: `${(position.x + .5) / 12 * 100}%`, top: `${(position.y + .5) / 16 * 100}%`, "--robot-color": color}}>
                <b>↑</b><small>{start + 1}</small>
            </span>;
        }) : null}
    </React.Fragment>;
}

function CourseThumbnail({course, state}) {
    return <span className="course-thumbnail">
        <CourseFieldContents course={course} state={state}/>
    </span>;
}

class CourseSetup extends React.Component {
    constructor(props) {
        super(props);
        this.state = {board: props.state.course.board, start: props.state.course.start, rotation: props.state.course.rotation || 0,
            name: "Мой курс", flags: [[2,2], [9,5], [5,9]], flagHistory: [], selectedPreviewOpen: true};
    }

    saveCustom() {
        this.props.app.socket.emit("set-custom-course", {name: this.state.name, board: this.state.board, start: this.state.start,
            rotation: Number(this.state.rotation), flags: this.state.flags});
    }

    setFlags(flags) {
        this.setState((state) => ({flags, flagHistory: [...state.flagHistory, state.flags].slice(-20)}));
    }

    toggleFlag(x, y) {
        const index = this.state.flags.findIndex(([flagX, flagY]) => flagX === x && flagY === y);
        if (index >= 0) return this.setFlags(this.state.flags.filter((flag, flagIndex) => flagIndex !== index));
        if (this.state.flags.length < 8) this.setFlags([...this.state.flags, [x, y]]);
    }

    moveFlag(index, offset) {
        const target = index + offset;
        if (target < 0 || target >= this.state.flags.length) return;
        const flags = [...this.state.flags];
        [flags[index], flags[target]] = [flags[target], flags[index]];
        this.setFlags(flags);
    }

    render() {
        const {state, app, playerCount, readOnly} = this.props;
        const selected = state.course.id;
        const previewFlags = this.state.flags;
        return <section className="course-setup panel">
            <div className="course-heading"><div><h3>Готовые курсы</h3><p>Игроков сейчас: {playerCount}. Подходящие курсы отмечены зелёной меткой.</p></div>
                {readOnly ? <span>Выбирает хост</span> : <span>Выберите курс</span>}</div>
            <div className="course-list">{state.courses.map((course) => <button key={course.id}
                className={`course-card ${selected === course.id ? "selected" : ""} ${playerCount >= course.min && playerCount <= course.max ? "recommended" : ""}`}
                disabled={readOnly} aria-pressed={selected === course.id}
                onClick={() => !readOnly && app.socket.emit("select-course", course.id)}>
                <CourseThumbnail course={course} state={state}/>
                <span className="course-card-copy"><strong>{course.name}</strong><span>{course.board} · {course.length}</span><small>Игроки: {course.players} · {course.level}</small>
                    {course.specialRules ? <span className="special-rule-marker">Special Rules
                        <span className="special-rule-tooltip">{course.specialRules.description}</span>
                    </span> : null}
                    <b className={`course-fit ${playerCount >= course.min && playerCount <= course.max ? "fits" : "not-fit"}`}>
                        {playerCount >= course.min && playerCount <= course.max ? "Подходит для состава" : `Нужно игроков: ${course.players}`}</b></span>
            </button>)}</div>
            <section className={`selected-course-preview ${this.state.selectedPreviewOpen ? "expanded" : "collapsed"}`}>
                <div className="selected-course-heading"><div><strong>Выбранный курс: {state.course.name}</strong>
                    <span>{state.course.board} · игроков: {state.course.players}</span></div>
                    <span className="selected-course-actions">
                        {!readOnly && playerCount > 1 ? <button type="button" onClick={() => app.socket.emit("shuffle-starts")}>Перемешать старты</button> : null}
                        <button type="button" onClick={() => this.setState({selectedPreviewOpen: !this.state.selectedPreviewOpen})}>
                            {this.state.selectedPreviewOpen ? "Свернуть" : "Показать поле"}</button>
                    </span></div>
                {this.state.selectedPreviewOpen ? <div className={`selected-course-body ${state.course.specialRules ? "has-special-rules" : ""}`}>
                    <div className="large-course-preview"><CourseFieldContents course={state.course} state={state} flagClassName="large-preview-flag" showLobbyRobots/></div>
                    {state.course.specialRules ? <div className="selected-course-special-rules">
                        <strong>Special Rules</strong><p>{state.course.specialRules.description}</p>
                    </div> : null}
                </div> : null}
            </section>
            {!readOnly ? <details className="constructor"><summary>Конструктор своего курса</summary>
                <div className="constructor-fields">
                    <label>Название<input value={this.state.name} onChange={(event) => this.setState({name: event.target.value})}/></label>
                    <label>Карта<select value={this.state.board} onChange={(event) => this.setState({board: event.target.value})}>{Object.keys(state.boardCards).map((board) => <option key={board}>{board}</option>)}</select></label>
                    <label>Старт<select value={this.state.start} onChange={(event) => this.setState({start: event.target.value})}>{state.startCards.map((start) => <option value={start} key={start}>{start.replace(".jpg", "")}</option>)}</select></label>
                    <label>Поворот карты<select value={this.state.rotation} onChange={(event) => this.setState({rotation: Number(event.target.value)})}>
                        {[0,90,180,270].map((rotation) => <option value={rotation} key={rotation}>{rotation}°</option>)}</select></label>
                </div>
                <div className="constructor-preview"
                    onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const factoryHeight = rect.height * .75;
                        const relativeY = event.clientY - rect.top;
                        if (relativeY < 0 || relativeY >= factoryHeight) return;
                        const x = Math.min(11, Math.floor((event.clientX - rect.left) / rect.width * 12));
                        const y = Math.min(11, Math.floor(relativeY / factoryHeight * 12));
                        this.toggleFlag(x, y);
                    }}><img className="constructor-preview-board constructor-preview-factory" style={{transform: `rotate(${this.state.rotation}deg)`}}
                        src={boardImageUrl(state, this.state.board)}/>
                    <img className="constructor-preview-board constructor-preview-start"
                        src={startImageUrl(state, this.state.start)}/>
                    {previewFlags.map(([x, y], index) => <b className="preview-flag" key={`${x},${y},${index}`}
                        style={{left: `${(x + .5) / 12 * 100}%`, top: `${(y + .5) / 16 * 100}%`}}>{index + 1}</b>)}
                </div>
                <p className="constructor-help">Щелчок ставит флаг; повторный щелчок по клетке убирает его.</p>
                <div className="flag-editor"><div className="flag-editor-heading"><strong>Порядок флагов</strong><span>{previewFlags.length}/8</span></div>
                    {previewFlags.length ? previewFlags.map(([x, y], index) => <div className="flag-editor-row" key={`${x},${y},${index}`}>
                        <b>{index + 1}</b><span>Флаг {index + 1}</span>
                        <button type="button" disabled={index === 0} title="Переместить раньше" onClick={() => this.moveFlag(index, -1)}>↑</button>
                        <button type="button" disabled={index === previewFlags.length - 1} title="Переместить позже" onClick={() => this.moveFlag(index, 1)}>↓</button>
                        <button type="button" title="Удалить флаг" onClick={() => this.setFlags(previewFlags.filter((flag, flagIndex) => flagIndex !== index))}>×</button>
                    </div>) : <p>Поставьте хотя бы один флаг на поле.</p>}
                    <div className="flag-editor-actions"><button type="button" disabled={!this.state.flagHistory.length} onClick={() => this.setState((current) => ({flags: current.flagHistory[current.flagHistory.length - 1], flagHistory: current.flagHistory.slice(0, -1)}))}>Отменить</button>
                        <button type="button" disabled={!previewFlags.length} onClick={() => this.setFlags([])}>Убрать все</button></div>
                </div>
                <button className="primary" type="button" disabled={!previewFlags.length} onClick={() => this.saveCustom()}>Выбрать свой курс</button>
            </details> : null}
        </section>;
    }
}

function PowerDownToken({selected = false, confirmed = false, urgent = false, unavailable = false, disabled = false, onClick, title}) {
    return <button type="button" className={`power-down-token ${selected ? "selected" : ""} ${confirmed ? "confirmed" : ""} ${urgent ? "urgent" : ""} ${unavailable ? "unavailable" : ""}`}
        disabled={disabled} aria-pressed={selected} aria-label="Power Down" title={title} onClick={onClick}>
        <span>POWER<br/>DOWN</span>
    </button>;
}

function ProgrammingTimer({state}) {
    if (state.phase !== "programming") return null;
    const automatic = state.programmingAutoFill;
    if (automatic) {
        const fills = automatic.fills || [{userId: automatic.userId, registers: automatic.registers || []}];
        const details = fills.map((fill) => {
            const name = state.playerNames[fill.userId] || fill.userId;
            return fill.registers.length ? `${name}: ${fill.registers.map((register) => register + 1).join(", ")}` : `${name}: программа зафиксирована`;
        }).join(" · ");
        return <section className="programming-timer expired" role="status" aria-live="assertive">
            <span className="timer-random-icon" aria-hidden="true">◆</span>
            <div><strong>Время вышло</strong><small>{automatic.count ? `Случайное заполнение · ${details}` : details}</small></div>
        </section>;
    }
    const timer = state.programmingTimer;
    if (!timer) return null;
    const remaining = Math.max(0, Number(timer.remaining) || 0);
    const pendingNames = (timer.userIds || [timer.userId]).map((userId) => state.playerNames[userId] || userId).join(", ");
    return <section className={`programming-timer ${remaining <= 10 ? "warning" : ""}`} role="timer" aria-live="polite">
        <span className="timer-clock" aria-hidden="true"><strong>{remaining}</strong><small>сек</small></span>
        <div><strong>{timer.global ? "Особый таймер курса" : "Последний игрок программирует"}</strong>
            <small>{pendingNames}: после сигнала пустые регистры заполнятся случайно.</small></div>
    </section>;
}

function Program({state, privateState, app}) {
    if (state.phase !== "programming" || !state.playerSlots.includes(state.userId)) return null;
    if (privateState.poweredDown) return <section className="program power-down-active panel">
        <PowerDownToken selected confirmed disabled title="Робот находится в Power Down"/>
        <div><h2>Power Down · раунд {state.round}</h2><p>Повреждения сняты. Робот не получает карты и не двигается самостоятельно, но поле продолжает на него воздействовать.</p></div>
    </section>;
    const selected = privateState.selected || [];
    const selectedCount = selected.filter(Boolean).length;
    const registerCards = privateState.registerCards || [];
    const lockedRegisters = privateState.lockedRegisters || [];
    const autoFilledRegisters = privateState.autoFilledRegisters || [];
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
                <button onClick={() => app.socket.emit("auto-program")} disabled={privateState.locked}>Авто</button>
                <div className="power-down-action">
                    <PowerDownToken selected={!!privateState.powerDownIntent}
                        confirmed={!!privateState.locked && !!privateState.powerDownIntent}
                        urgent={privateState.damage >= 4} unavailable={!privateState.canPowerDown}
                        disabled={privateState.locked || !privateState.canPowerDown}
                        title={!privateState.canPowerDown ? privateState.powerDownUnavailableReason || "Power Down недоступен"
                            : privateState.powerDownIntent ? "Отменить Power Down следующего раунда" : "Power Down в следующем раунде"}
                        onClick={() => app.socket.emit("set-power-down-intent", {enabled: !privateState.powerDownIntent})}/>
                    <small>{!privateState.canPowerDown ? (privateState.powerDownUnavailableReason === "Курс запрещает Power Down" ? "Запрещён курсом" : "Нужен урон")
                        : privateState.locked && privateState.powerDownIntent ? "Объявлено"
                        : privateState.powerDownIntent ? "Выбрано" : "Следующий раунд"}</small>
                </div>
                <button className="primary" onClick={() => app.socket.emit("lock-program")}
                    disabled={selectedCount !== 5 || privateState.locked}>{privateState.locked ? "Готов ✓" : "Готов"}</button>
            </div>
        </div>
        <div className="registers" onDragOver={(event) => !privateState.locked && event.preventDefault()}
            onDrop={dropOnRegisters}>
            {[0, 1, 2, 3, 4].map((index) => {
                const card = registerCards[index] || privateState.hand.find((item) => item.id === selected[index]);
                return <div className={`register ${lockedRegisters.includes(index) ? "locked" : ""} ${autoFilledRegisters.includes(index) ? "auto-filled" : ""}`} key={index}
                    draggable={!!card && !lockedRegisters.includes(index) && !privateState.locked}
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
                return <button className={`card ${selectedIndex >= 0 ? "selected" : ""} ${autoFilledRegisters.includes(selectedIndex) ? "auto-filled-source" : ""}`} key={card.id}
                    disabled={privateState.locked}
                    draggable={!privateState.locked}
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
    const resolving = state.phase === "resolving" || state.phase === "finished";
    const users = state.playerSlots.filter(Boolean).filter((userId) => {
        const program = (state.programs && state.programs[userId]) || {cards: []};
        return resolving || (program.lockedRegisters || []).some((index) => !!program.cards[index]);
    });
    if (!users.length) return null;
    return <section className="public-programs panel"><h2>{resolving ? "Регистры роботов" : "Открытые заблокированные регистры"}</h2>
        {users.map((userId) => {
            const program = (state.programs && state.programs[userId]) || {cards: []};
            return <div className="public-program-row" key={userId}>
                <span className={userId === state.userId ? "own-player-name" : "player-name"}>{state.playerNames[userId]}
                    {((state.playerStats || {})[userId] || {}).powerDownNextRound ? <small>Power Down далее</small> : null}</span>
                <div>{[0,1,2,3,4].map((index) => {
                    const card = program.cards[index];
                    const current = state.phase === "resolving" && state.register === index + 1;
                    const randomLocked = program.poweredDown && (program.lockedRegisters || []).includes(index) && !!card;
                    const isRevealed = !!card || (program.poweredDown && index < (state.revealedRegisters || 0));
                    return <span className={`public-register ${isRevealed ? "revealed" : "closed"} ${current ? "current" : ""} ${randomLocked ? "random-locked" : ""}`} key={index}
                        title={card ? `${card.label}, приоритет ${card.priority}${randomLocked ? ", случайная карта заблокированного регистра" : ""}` : "Закрытый регистр"}>
                        {card ? <><b>{card.label}</b><small className="priority-badge" title="Приоритет карты">{card.priority}</small></>
                            : program.poweredDown && isRevealed ? "Zzz" : "?"}
                    </span>;
                })}</div>
            </div>;
        })}
    </section>;
}

function PowerDownChoicePanel({state, privateState, app}) {
    if (state.phase !== "power-down-choice") return null;
    const progress = state.powerDownChoice || {answered: 0, total: 0};
    const choice = privateState.powerDownChoice || {eligible: false, answered: false, choice: null};
    return <section className="power-down-choice-panel panel">
        <div><h2>Продолжить Power Down?</h2><p>Ответили: {progress.answered} из {progress.total}. Решения откроются одновременно.</p></div>
        {choice.eligible ? <div className="power-down-choice-actions">
            <button type="button" className={choice.answered && choice.choice === false ? "selected" : ""}
                disabled={choice.answered} onClick={() => app.socket.emit("choose-power-down-continuation", {enabled: false})}>Проснуться</button>
            <PowerDownToken selected={choice.answered && choice.choice === true}
                confirmed={choice.answered && choice.choice === true} disabled={choice.answered}
                title="Остаться в Power Down ещё на один раунд"
                onClick={() => app.socket.emit("choose-power-down-continuation", {enabled: true})}/>
            {choice.answered ? <small>Ваш выбор принят</small> : null}
        </div> : <p className="power-down-waiting">Ожидаем решения отключённых роботов.</p>}
    </section>;
}

class ReentryPanel extends React.Component {
    constructor(props) {
        super(props);
        this.state = {poweredDown: null};
    }

    componentDidUpdate(previousProps) {
        if (previousProps.state.reentryUserId !== this.props.state.reentryUserId && this.state.poweredDown !== null)
            this.setState({poweredDown: null});
    }

    render() {
        const {state, privateState, app} = this.props;
        if (state.phase !== "reentry") return null;
        const reentry = privateState.reentry || {active: false, candidates: []};
        const activeName = state.playerNames[state.reentryUserId] || "игрок";
        if (!reentry.active)
            return <section className="reentry-panel panel"><h2>Возрождение</h2><p>Ожидаем, пока {activeName} выберет клетку и направление.</p></section>;
        const arrows = {north: "↑", east: "→", south: "↓", west: "←"};
        const modeChosen = !reentry.needsPowerDownChoice || this.state.poweredDown !== null;
        return <section className="reentry-panel panel">
            <h2>Выберите возрождение</h2>
            <p>Сначала укажите режим, если он доступен, затем клетку и направление робота.</p>
            {reentry.needsPowerDownChoice ? <div className="reentry-power-down-choice">
                <button type="button" className={this.state.poweredDown === false ? "selected" : ""}
                    onClick={() => this.setState({poweredDown: false})}>Обычный режим</button>
                <PowerDownToken selected={this.state.poweredDown === true} title="Возродиться в Power Down"
                    onClick={() => this.setState({poweredDown: true})}/>
            </div> : null}
            <div className="reentry-options">{reentry.candidates.map((candidate, index) => <div className="reentry-option" key={`${candidate.x},${candidate.y}`}>
                <strong>{candidate.archive ? "Архив" : `Клетка ${index + 1}`}</strong>
                <span>{candidate.directions.map((direction) => <button className="direction-choice" key={direction} disabled={!modeChosen}
                    title={`Направление: ${direction}`} onClick={() => app.socket.emit("choose-reentry", {x: candidate.x, y: candidate.y,
                        direction, ...(reentry.needsPowerDownChoice ? {poweredDown: this.state.poweredDown} : {})})}>
                    {arrows[direction]}
                </button>)}</span>
            </div>)}</div>
        </section>;
    }
}

class Game extends React.Component {
    constructor() {
        super();
        const storedScale = Number(localStorage.getItem("roborally-board-scale"));
        const boardScale = Number.isInteger(storedScale) && storedScale >= 30 && storedScale <= 200 && storedScale % 10 === 0
            ? storedScale : 50;
        const boardHintsEnabled = localStorage.getItem("roborally-board-hints") !== "false";
        this.state = {inited: false, phase: "loading", playerNames: {}, playerSlots: [], robots: [], log: [], flags: [],
            boardScale, boardPanX: 0, boardPanY: 0, boardPanMode: false, boardHintsEnabled,
            hudCollapsed: false, bottomDockCollapsed: false};
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
        const isPlayer = state.playerSlots.includes(state.userId);
        const showBottomDock = (state.phase === "programming" && isPlayer) || state.phase === "power-down-choice" || state.phase === "reentry"
            || state.phase === "resolving" || state.phase === "finished";
        return <main className="roborally-app">
            <header>
                <div><h1>RoboRally</h1><p>Комната {state.roomId} · {state.phase === "programming" ? "программирование" : state.phase === "resolving" ? "исполнение" : state.phase === "power-down-choice" ? "решение Power Down" : state.phase === "reentry" ? "возрождение" : state.phase === "finished" ? "финиш" : "лобби"}</p></div>
                {state.userId === state.hostId && state.phase !== "lobby" ? <button onClick={() => this.socket.emit("restart-game")}>В лобби</button> : null}
            </header>
            {state.phase === "lobby" ? <Lobby state={state} app={this}/> : <div className="game-screen">
                <ProgrammingTimer state={state}/>
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
                                src={boardImageUrl(state, state.board.name)} />
                            <img className="start-card" draggable="false" src={startImageUrl(state, state.board.start)} />
                            <div className="board-overlay" aria-hidden="true">
                                {state.flags.filter((flag) => flag.x != null && flag.y != null).map((flag) => <div className="flag" key={flag.number}
                                    style={{left: `${(flag.x + .5) / 12 * 100}%`, top: `${(flag.y + .5) / 16 * 100}%`}}>
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
                                {state.robots.filter((robot) => robot.death).map((robot) => <RobotDeath key={`${robot.userId}-${robot.death.id}`} robot={robot}/>)}
                                {state.robots.map((robot) => <Robot key={robot.userId} robot={robot} names={state.playerNames} ownUserId={state.userId}/>)}
                                <BoardEvents events={state.boardEvents}/>
                                <LaserEffects shots={state.laserShots} robots={state.robots}/></div>
                            <BoardHints state={state} enabled={state.boardHintsEnabled}/>
                            </div>
                        </div>
                        </div>
                    </div>
                    <aside className={`game-side-hud ${state.hudCollapsed ? "collapsed" : ""}`}>
                        <div className="dock-title"><strong>Информация</strong><button type="button" title={state.hudCollapsed ? "Показать панели" : "Свернуть панели"}
                            onClick={() => this.setState({hudCollapsed: !state.hudCollapsed})}>{state.hudCollapsed ? "◀" : "▶"}</button></div>
                        <div className="dock-scroll">
                        <PlayerPanel state={state}/>
                        <CourseSpecialRules course={state.course}/>
                        <FieldGuide/>
                        <section className="panel log"><h2>Системный журнал</h2>{state.log.map((item, index) => <p key={index}>{item}</p>)}</section>
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
                            <button type="button" className={`board-hints-toggle ${state.boardHintsEnabled ? "active" : ""}`}
                                title="Включить или отключить подсказки элементов поля" aria-label="Подсказки элементов поля"
                                aria-pressed={state.boardHintsEnabled} onClick={() => {
                                    const enabled = !state.boardHintsEnabled;
                                    localStorage.setItem("roborally-board-hints", String(enabled));
                                    this.setState({boardHintsEnabled: enabled});
                                }}>?</button>
                        </div>
                        {state.phase === "resolving" ? <section className="panel stage"><h2>Сейчас</h2><p>{state.stage}</p></section> : null}
                        </div>
                    </aside>
                </section>
                {showBottomDock ? <section className={`bottom-dock ${state.bottomDockCollapsed ? "collapsed" : ""}`}>
                    <button className="bottom-dock-toggle" type="button" onClick={() => this.setState({bottomDockCollapsed: !state.bottomDockCollapsed})}
                        title={state.bottomDockCollapsed ? "Показать игровую панель" : "Свернуть игровую панель"}>
                        {state.bottomDockCollapsed ? "Показать игровую панель ▲" : "Свернуть ▼"}
                    </button>
                    <div className="bottom-dock-scroll">
                        <Program state={state} privateState={this.privateState} app={this}/>
                        <PowerDownChoicePanel state={state} privateState={this.privateState} app={this}/>
                        <ReentryPanel state={state} privateState={this.privateState} app={this}/>
                        <PublicPrograms state={state}/>
                        {state.phase === "finished" ? <section className="winner panel"><h2>Победитель: {state.playerNames[state.winnerId]}</h2><p>Все контрольные флаги активированы.</p></section> : null}
                    </div>
                </section> : null}
            </div>}
        </main>;
    }
}

ReactDOM.render(<Game/>, document.getElementById("root"));
