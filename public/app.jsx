const DIRECTION_ANGLES = {north: 0, east: 90, south: 180, west: 270};
const FIELD_VECTORS = {north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0]};
const OPPOSITE_DIRECTION = {north: "south", east: "west", south: "north", west: "east"};
const DIRECTION_NAMES = {north: "вверх", east: "вправо", south: "вниз", west: "влево"};
const LOBBY_ROBOT_COLORS = ["#f04444", "#2d82ff", "#ffd23f", "#27c56d", "#b66dff", "#ff8b38", "#32c8cb", "#f26bb4"];

function playerName(state, userId) {
    const engineName = state.authUsers ? CommonRoom.getPlayerNameStatic(userId, state) : null;
    return engineName || (state.playerNames || {})[userId] || userId || "игрок";
}

function boardImageUrl(state, board) {
    return state.boardImages[board];
}

function standardBoardName(state, requested) {
    const boards = Object.keys(state.boardCards || {}).filter((board) => state.boardImages?.[board]);
    return boards.includes(requested) ? requested : boards[0] || "";
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

function wallBetweenPits(pitCells, wall) {
    const [xText, yText, direction] = wall.split(",");
    const x = Number(xText), y = Number(yText), [dx,dy] = FIELD_VECTORS[direction];
    return pitCells.has(`${x},${y}`) && pitCells.has(`${x+dx},${y+dy}`);
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
        return {x: event.clientX, y: event.clientY};
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
        const explicitConnections = features.conveyorConnections === null || features.conveyorConnections === undefined
            ? null : new Set(features.conveyorConnections);
        const hintConnections = new Set((features.hintConnections || []).map((connection) => connection.split("|").sort().join("|")));
        const conveyorGroups = connectedGroups(Object.keys(conveyorDirections), (left, right) => {
            const [lx, ly] = keyPoint(left);
            const [rx, ry] = keyPoint(right);
            const flowsTo = (from, toX, toY) => {
                const [fx, fy] = keyPoint(from);
                const vector = FIELD_VECTORS[conveyorDirections[from]];
                return vector && fx + vector[0] === toX && fy + vector[1] === toY;
            };
            if (explicitConnections && ly < 12 && ry < 12)
                return explicitConnections.has(`${left}|${right}`) || explicitConnections.has(`${right}|${left}`);
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
        (state.robots || []).filter((robot) => robot.archive && robot.archive.x != null && robot.archive.y != null && !robot.eliminated).forEach((robot) => items.push({id: `archive-${robot.userId}`,
            kind: "corner", x: robot.archive.x + .096, y: robot.archive.y + .096, title: "Архивная точка",
            description: `Точка возрождения: ${playerName(state, robot.userId)}${robot.userId === state.userId ? " (вы)" : ""}.`}));
        (state.robots || []).filter((robot) => robot.x != null && robot.y != null).forEach((robot) => items.push({id: `robot-${robot.userId}`,
            kind: "circle", x: robot.x + .5, y: robot.y + .5, r: .33, title: "Робот",
            description: `${playerName(state, robot.userId)}${robot.userId === state.userId ? " (вы)" : ""}. Направление: ${DIRECTION_NAMES[robot.direction]}. ${(((state.playerStats || {})[robot.userId]) || {}).poweredDown ? "Power Down: не стреляет." : "Стреляет в фазе 7."}`}));

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
        const tooltipLeft = this.state.x > window.innerWidth - 260;
        const tooltipAbove = this.state.y > window.innerHeight - 100;
        const tooltip = enabled && hovered ? ReactDOM.createPortal(
            <div className={`field-tooltip ${tooltipLeft ? "to-left" : ""} ${tooltipAbove ? "above" : ""}`}
                style={{left: `${this.state.x}px`, top: `${this.state.y}px`}} role="tooltip">
                <strong>{hovered.title}</strong><span>{hovered.description}</span>
            </div>, document.body) : null;
        return <div className={`board-hints ${enabled ? "enabled" : "disabled"}`}>
            <svg viewBox="0 0 12 16" preserveAspectRatio="none" aria-hidden="true">
                {hovered ? draw(hovered, false) : null}
                {items.map((item) => draw(item, true))}
            </svg>
            {tooltip}
        </div>;
    }
}

function Robot({robot, state, names = {}, ownUserId}) {
    if (robot.x == null || robot.y == null) return null;
    const style = {
        left: `${(robot.x + .5) / 12 * 100}%`,
        top: `${(robot.y + .5) / 16 * 100}%`,
        "--robot-color": robot.color,
        "--robot-angle": `${Number.isFinite(robot.headingTurns) ? robot.headingTurns * 90 : DIRECTION_ANGLES[robot.direction]}deg`
    };
    return <div className={`robot ${robot.userId === ownUserId ? "own-robot" : ""} ${robot.eliminated ? "eliminated" : ""}`} style={style} data-user-id={robot.userId}
                title={`${state ? playerName(state, robot.userId) : names[robot.userId] || robot.userId}: ${robot.x + 1}, ${robot.y + 1}`}>
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

function BoardEvents({events = [], replayKey = "live"}) {
    if (!events.length) return null;
    return <div className="board-events-layer" aria-hidden="true">{events.map((event) => {
        const [dx,dy] = FIELD_VECTORS[event.direction] || [0,0];
        return <span className={`board-event board-event-${event.type} ${event.turn > 0 ? "turn-right" : event.turn < 0 ? "turn-left" : ""}`}
            key={`${replayKey}-${event.id}`} data-event-id={event.id} data-user-id={event.userId}
            style={{left: `${(event.x + .5) / 12 * 100}%`, top: `${(event.y + .5) / 16 * 100}%`,
                "--event-color": event.color || "#8ddcff", "--event-dx": `${-dx * 2.2}cqw`, "--event-dy": `${-dy * 2.2}cqw`}}>
            <BoardEventIcon event={event}/>
        </span>;
    })}</div>;
}

function LaserEffects({shots = [], robots = [], replayKey = "live"}) {
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
            return <g className={`laser-shot laser-shot-${shot.source}`} data-source-user-id={shot.sourceUserId || undefined} key={`${replayKey}-${shot.id}`}>
                {beamLines(shot).map((line, index) => <React.Fragment key={index}>
                    <line className="laser-beam-glow" pathLength="1" {...line}/>
                    <line className="laser-beam-core" pathLength="1" {...line}/>
                </React.Fragment>)}
                <circle className="laser-muzzle" cx={shot.start.x} cy={shot.start.y} r=".16"/>
            </g>;
        })}
        {[...hits.entries()].map(([userId, hit]) => <g className="laser-impact" key={`${replayKey}-${userId}`}
            style={{"--impact-color": (robotsByUser[userId] || {}).color || "#ffcf4a"}}>
            <circle className="laser-impact-ring" cx={hit.x} cy={hit.y} r=".38"/>
            <circle className="laser-impact-flash" cx={hit.x} cy={hit.y} r=".2"/>
            <text x={hit.x} y={hit.y - .42} textAnchor="middle">−{hit.damage}</text>
        </g>)}
    </svg>;
}

function HostLivesEditor({userId, lives, app}) {
    const [draft, setDraft] = React.useState(lives === null ? "∞" : String(lives));
    const [editing, setEditing] = React.useState(false);
    React.useEffect(() => setDraft(lives === null ? "∞" : String(lives)), [lives]);
    const trimmed = draft.trim();
    const valid = trimmed === "∞" || (/^[1-9]\d*$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)));
    const commit = () => {
        const next = trimmed === "∞" ? null : Number(trimmed);
        if (valid) {
            app.socket.emit("set-player-lives", {userId, lives: next});
            setEditing(false);
        }
    };
    return <span className="rr-host-lives">
        {editing ? <span className="player-stat lives rr-lives-inline-edit">
            <i aria-hidden="true">♥</i>
            <input aria-label={`Новое число жизней: ${userId}`} title="Положительное число или ∞" aria-invalid={!valid} inputMode="numeric" autoFocus value={draft}
                onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Enter") commit();
                    if (event.key === "Escape") setEditing(false);
                }}/>
            <button type="button" aria-label="Сохранить жизни" title={valid ? "Сохранить жизни" : "Введите число от 1 или ∞"} disabled={!valid} onClick={commit}>✓</button>
        </span> : <button type="button" className="player-stat lives" aria-label={`Оставшиеся жизни: ${lives === null ? "бесконечно" : lives}. Изменить`}
            title="Изменить жизни робота" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            <i aria-hidden="true">♥</i><b>{lives === null ? "∞" : lives}</b><span className="rr-lives-pencil" aria-hidden="true">✎</span></button>}
    </span>;
}

function PlayerPanel({state, app}) {
    const robotsByUser = {};
    state.robots.forEach((robot) => robotsByUser[robot.userId] = robot);
    const players = state.playerSlots.filter(Boolean);
    const spectators = (state.onlinePlayers || []).filter((userId) => !players.includes(userId));
    const isPlayer = players.includes(state.userId);
    const canChangeRole = state.paused && state.phase !== "finished";
    const removedFromGame = (state.raceExcludedPlayers || []).includes(state.userId);
    const displayedStats = state.historyReview && !state.historyReview.actual
        && state.historyReview.playerStats ? state.historyReview.playerStats : state.playerStats;
    return <section className="players-panel rr-panel">
        <h2>Роботы</h2>
        {players.map((userId) => {
            const robot = robotsByUser[userId] || {};
            const stats = (displayedStats && displayedStats[userId]) || {};
            const status = stats.finished ? "finished"
                : stats.poweredDown ? "powered-down"
                : stats.powerDownNextRound ? "power-down-next"
                : state.phase === "programming" && stats.ready ? "ready" : "";
            const statusTitle = status === "finished" ? "Робот собрал все флаги и завершил заезд"
                : status === "powered-down" ? "Робот находится в Power Down"
                : status === "power-down-next" ? "Робот отключится в следующем раунде"
                : status === "ready" ? "Игрок закончил программирование" : "";
            return <div className="player-row" key={userId}>
                <i style={{background: robot.color || state.playerColors[userId]}}></i>
                <div className="player-identity"><span className={`${userId === state.userId ? "own-player-name" : "player-name"} player-name-status ${status}`}
                    title={statusTitle || undefined}>{playerName(state, userId)}</span>
                    <MemberHostControls state={state} userId={userId}/></div>
                <span className="player-stat flags" title="Активированные флаги" aria-label={`Активированные флаги: ${stats.checkpoints || 0} из ${state.flags.length}`}>
                    <i aria-hidden="true">⚑</i><b>{stats.checkpoints || 0}/{state.flags.length}</b></span>
                <span className="player-stat damage" title="Повреждения" aria-label={`Повреждения: ${stats.damage || 0}`}>
                    <i aria-hidden="true">⚡</i><b>{stats.damage || 0}</b></span>
                {state.userId === state.hostId && state.phase !== "finished" && state.gameOptions?.startingLives !== null
                    && (!state.historyReview || state.historyReview.actual) ?
                    <HostLivesEditor userId={userId} lives={stats.lives} app={app}/>
                    : <span className="player-stat lives" title="Оставшиеся жизни" aria-label={`Оставшиеся жизни: ${stats.lives == null ? "бесконечно" : stats.lives}`}>
                        <i aria-hidden="true">♥</i><b>{stats.lives == null ? "∞" : stats.lives}</b></span>}
                {stats.finished ? <small>Финиш · {Math.max(1, (state.finishOrder || []).indexOf(userId) + 1)}</small>
                    : stats.poweredDown ? <small>POWER DOWN</small> : stats.powerDownNextRound ? <small>POWER DOWN · следующий раунд</small> : null}
            </div>;
        })}
        <div className="rr-game-spectators" aria-label="Зрители">
            <h3>Зрители <small>{spectators.length}</small></h3>
            {spectators.length ? <div className="rr-game-spectator-list">{spectators.map((userId) =>
                <span className="rr-game-spectator" key={userId}>
                    <PlayerName data={state} id={userId}/>{userId === state.hostId ? <small> · хост</small> : null}
                    <MemberHostControls state={state} userId={userId}/>
                </span>)}</div> : <p>Нет зрителей</p>}
        </div>
        {canChangeRole ? <div className="rr-game-role-actions">
            <button type="button" disabled={isPlayer || players.length >= 8 || removedFromGame}
                title={removedFromGame ? "Хост исключил вас из текущего заезда" : undefined}
                onClick={() => app.socket.emit("join-game")}>{removedFromGame ? "Исключён из заезда" : "Войти в игру"}</button>
            <button type="button" disabled={!isPlayer}
                onClick={() => app.socket.emit("spectators-join")}>Стать зрителем</button>
        </div> : null}
    </section>;
}

const GUIDE_PHASES = [
    ["Карты", "Все открывают текущий регистр"],
    ["Роботы", "Команды по убыванию приоритета"],
    ["Экспресс", "Экспресс-конвейеры движут на 1 клетку"],
    ["Конвейеры", "Все конвейеры движут на 1 клетку"],
    ["Толкатели", "Срабатывают номера текущего регистра"],
    ["Шестерни", "Поворачивают роботов на 90°"],
    ["Лазеры", "Стреляют поле и активные роботы"],
    ["Флаги", "Флаги и архивные точки активируются"]
];

const GUIDE_ELEMENTS = [
    {id: "conveyor-straight", title: "Конвейер", phase: "4", text: "Одновременно перемещает роботов на 1 клетку и не толкает их."},
    {id: "express-straight", title: "Экспресс-конвейер", phase: "3 и 4", text: "Перемещает робота дважды: по 1 клетке в каждой фазе."},
    {id: "conveyor-turn", title: "Поворот конвейера", phase: "3 или 4", text: "Поворачивает робота, если лента привезла его на изгиб."},
    {id: "pusher-even", title: "Чётный толкатель", phase: "5", text: "Толкает на 1 клетку только в напечатанные чётные регистры."},
    {id: "pusher-odd", title: "Нечётный толкатель", phase: "5", text: "Толкает на 1 клетку только в напечатанные нечётные регистры."},
    {id: "gear-clockwise", title: "Правая шестерня", phase: "6", text: "Поворачивает робота на 90° по часовой стрелке."},
    {id: "gear-counterclockwise", title: "Левая шестерня", phase: "6", text: "Поворачивает робота на 90° против часовой стрелки."},
    {id: "laser-double", title: "Лазер", phase: "7", text: "Наносит 1 повреждение за каждый луч. Стена или первый робот останавливает лазер."},
    {id: "wall", title: "Стена", phase: "Всегда", text: "Блокирует движение, толкание и лазерные лучи."},
    {id: "pit", title: "Яма", phase: "Всегда", text: "Попавший сюда робот уничтожается и теряет жизнь."},
    {id: "repair", title: "Ремонтный ключ", phase: "После регистра 5", text: "Становится архивом и снимает 1 повреждение в конце раунда."},
    {id: "robot", title: "Робот и направление", phase: "2 и 7", text: "Выполняет карту, может толкать роботов и затем стреляет вперёд.", kind: "robot"},
    {id: "flag", title: "Флаг с ключом", phase: "8", text: "Берётся только по порядку; также служит архивом и ремонтирует.", kind: "flag"},
    {id: "archive", title: "Архивная метка", phase: "8", text: "Последняя сохранённая точка, в которой робот возрождается.", kind: "archive"}
];

function GuideToken({kind}) {
    if (kind === "robot") return <span className="guide-robot-token"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 12 83 57H64v27H36V57H17Z"/></svg></span>;
    if (kind === "flag") return <span className="guide-flag-token"><i className="flag-cloth">1</i><i className="flag-wrench"></i></span>;
    return <span className="guide-archive-token">⚙</span>;
}

function GuidePhaseList({full = false}) {
    return <ol className={full ? "guide-phase-timeline" : "quick-phases"}>
        {GUIDE_PHASES.map(([title, text], index) => <li key={title}><b>{index + 1}</b><span><strong>{title}</strong>{full ? <small>{text}</small> : null}</span></li>)}
    </ol>;
}

function QuickGuide({onOpen, onOpenConveyors}) {
    return <section className="rr-panel quick-guide" aria-labelledby="quick-guide-title">
        <div className="quick-guide-heading"><h2 id="quick-guide-title">Шпаргалка</h2><div className="quick-guide-actions">
            <button type="button" className="conveyor-guide-open" onClick={onOpenConveyors}>КОНВЕЙЕРЫ</button>
            <button type="button" className="quick-guide-open" onClick={onOpen}>Как играть</button></div></div>
        <details className="rr-game-disclosure"><summary>Цель и порядок хода</summary>
            <p className="quick-goal"><strong>Цель:</strong> активируйте все флаги строго по порядку.</p>
            <GuidePhaseList/>
            <p className="quick-repair">🔧 Ремонт на ключах и флагах — после пятого регистра.</p>
        </details>
    </section>;
}

class GuideModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = {tab: "how"};
        this.dialogRef = React.createRef();
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    componentDidUpdate(previousProps) {
        if (this.props.open && !previousProps.open) {
            this.returnFocus = this.props.returnFocus || document.activeElement;
            this.previousOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            document.addEventListener("keydown", this.handleKeyDown);
            this.setState({tab: "how"}, () => {
                const close = this.dialogRef.current && this.dialogRef.current.querySelector(".guide-close");
                if (close) close.focus();
            });
        } else if (!this.props.open && previousProps.open) this.releaseModal();
    }

    componentWillUnmount() {
        if (this.props.open) this.releaseModal();
    }

    releaseModal() {
        document.removeEventListener("keydown", this.handleKeyDown);
        document.body.style.overflow = this.previousOverflow || "";
        if (this.returnFocus && document.contains(this.returnFocus)) this.returnFocus.focus();
    }

    handleKeyDown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            this.props.onClose();
            return;
        }
        if (event.key !== "Tab" || !this.dialogRef.current) return;
        const focusable = [...this.dialogRef.current.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    selectTab(tab) {
        this.setState({tab});
    }

    renderHow() {
        const finishAllFlags = !!this.props.options?.finishAllFlags;
        return <div className="guide-copy guide-how">
            <section className="guide-lead"><div><span className="guide-kicker">Цель игры</span><h3>Доберитесь до всех флагов по порядку</h3>
                <p>Запрограммируйте робота так, чтобы он активировал флаги от первого до последнего. {finishAllFlags
                    ? "Финишировавший робот прекращает участие, а остальные могут доиграть маршрут. Первый финишировавший занимает первое место."
                    : "Побеждает завершивший маршрут."} В этой версии также побеждает последний игрок, у которого остались жизни.</p></div>
                <GuideToken kind="flag"/></section>
            <div className="guide-rule-grid">
                <article><b>1</b><h3>Составьте программу</h3><p>Выберите пять карт движения и разложите их в регистры слева направо. До готовности карты можно переставлять и менять местами.</p></article>
                <article><b>2</b><h3>Смотрите на приоритет</h3><p>В каждом регистре роботы исполняют карты от большего приоритета к меньшему. Так определяется, кто движется первым.</p></article>
                <article><b>3</b><h3>Двигайтесь и толкайте</h3><p>Робот не проходит сквозь стены. Войдя в занятую клетку, он толкает цепочку роботов, если за ней есть свободное место.</p></article>
                <article><b>4</b><h3>Переживите поле</h3><p>После команд срабатывают элементы фабрики. Один и тот же порядок повторяется для каждого из пяти регистров.</p></article>
            </div>
            <section><h3>Порядок одного регистра</h3><GuidePhaseList full={true}/></section>
            <aside className="guide-course-note">⚙ <span><strong>Специальные правила курса</strong> могут изменять эти базовые правила. Они показаны при выборе курса и во время партии.</span></aside>
        </div>;
    }

    renderField() {
        return <div className="guide-elements">
            <div className="guide-element-grid">{GUIDE_ELEMENTS.map((item) => <article className="guide-element-card" key={item.id}>
                <div className={`guide-element-visual ${item.kind ? "generated" : ""}`}>
                    {item.kind ? <GuideToken kind={item.kind}/> : <img loading="lazy" src={`/roborally/assets/guide/${item.id}.webp`} alt=""/>}
                </div>
                <div className="guide-element-copy"><div><h3>{item.title}</h3><span className="guide-phase-badge">Фаза {item.phase}</span></div><p>{item.text}</p></div>
            </article>)}</div>
        </div>;
    }

    renderDamage() {
        const options = this.props.options || {};
        return <div className="guide-copy guide-damage">
            <section className="guide-damage-scale"><div><b>0</b><span>полная рука<br/><strong>9 карт</strong></span></div><i></i><div><b>5–9</b><span>блокируются регистры<br/><strong>с 5-го к 1-му</strong></span></div><i></i><div className="danger"><b>10</b><span>робот уничтожен<br/><strong>−1 жизнь</strong></span></div></section>
            <div className="guide-rule-grid">
                <article><h3>Урон и жизнь</h3><p>Каждое повреждение уменьшает руку на одну карту. При 5–9 повреждениях регистры блокируются открытыми картами. При 10 повреждениях, падении в яму или за край робот теряет жизнь.</p></article>
                <article><h3>Архив и возрождение</h3><p>Робот возвращается перед раздачей карт в последнюю архивную точку с двумя повреждениями. Можно выбрать направление; если точка занята — допустимую соседнюю клетку.</p></article>
                <article><h3>Ремонт</h3><p>Робот на ключе или флаге сохраняет эту точку как архив и после пятого регистра снимает одно повреждение. Разблокированная карта сбрасывается.</p></article>
                <article><h3>Таймер последнего игрока</h3><p>{options.lastPlayerSeconds === null
                    ? "Таймер выключен: до готовности всех игроков можно отменить свой ответ и изменить программу. Особый таймер курса действует отдельно."
                    : `Когда готовыми стали все, кроме одного, запускается таймер на ${options.lastPlayerSeconds || 30} секунд. По истечении сервер случайно заполняет пустые регистры картами с руки.`}</p></article>
            </div>
            <section className="guide-power-down"><div className="guide-power-token"><span>POWER<br/>DOWN</span></div><div><h3>Power Down</h3>
                <p>{options.powerDownMode === "simple"
                    ? "Повреждённый робот выбирает отключение вместо программы и после подтверждения пропускает уже текущий раунд."
                    : "Повреждённый робот тайно объявляет отключение вместе с текущей программой. Он полностью исполняет этот раунд и отключается только в следующем."}</p>
                <p>В начале отключённого раунда повреждения снимаются. Робот не получает карты, не исполняет команды и не стреляет, но конвейеры, толкатели, шестерни, стационарные лазеры, столкновения, флаги и ремонт продолжают действовать.</p>
                <p>После раунда отключённые игроки одновременно решают, проснуться или остаться. Полученный во время отключения урон сохраняется при пробуждении и может заблокировать регистры.</p></div></section>
            <aside className="guide-course-note">Специальные правила выбранного курса могут менять отдельные правила этой памятки.</aside>
        </div>;
    }

    render() {
        if (!this.props.open) return null;
        const tabs = [["how", "Как играть"], ["field", "Элементы поля"], ["damage", "Урон и Power Down"]];
        return <div className="guide-backdrop" onClick={(event) => event.target === event.currentTarget && this.props.onClose()}>
            <section className="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-modal-title" ref={this.dialogRef}>
                <header className="guide-modal-header"><div><span>Справочник RoboRally</span><h2 id="guide-modal-title">Как управлять роботом и выжить на фабрике</h2></div>
                    <button type="button" className="guide-close" aria-label="Закрыть справочник" onClick={this.props.onClose}>×</button></header>
                <div className="guide-tabs" role="tablist" aria-label="Разделы справочника">{tabs.map(([id, label]) => <button type="button" role="tab" key={id}
                    id={`guide-tab-${id}`} aria-selected={this.state.tab === id} aria-controls={`guide-panel-${id}`}
                    className={this.state.tab === id ? "active" : ""} onClick={() => this.selectTab(id)}>{label}</button>)}</div>
                <div className="guide-modal-content" role="tabpanel" id={`guide-panel-${this.state.tab}`} aria-labelledby={`guide-tab-${this.state.tab}`}>
                    {this.state.tab === "how" ? this.renderHow() : this.state.tab === "field" ? this.renderField() : this.renderDamage()}
                </div>
            </section>
        </div>;
    }
}

function CourseSpecialRules({course}) {
    if (!course || !course.specialRules) return null;
    return <section className="rr-panel active-special-rules"><h2>Special Rules · {course.name}</h2>
        <p>{course.specialRules.description}</p></section>;
}

function PauseBanner({state}) {
    if (!state.paused) return null;
    const review = state.historyReview || {};
    const mode = review.playing ? "Воспроизведение журнала"
        : !review.actual && review.selected ? "Просмотр журнала" : "Актуальное состояние";
    const detail = review.playing
        ? review.selected ? `Раунд ${review.selected.round} · регистр ${review.selected.register} · ${review.stage || "выполнение"}` : "Подготовка воспроизведения"
        : !review.actual && review.selected
            ? `Раунд ${review.selected.round} · ${review.frameIndex === 0 ? "перед" : "стадия"} регистра ${review.selected.register}${review.stage ? ` · ${review.stage}` : ""}`
            : "Хост может открыть журнал выполненных регистров.";
    return <section className={`pause-banner ${review.playing || !review.actual && review.selected ? "history" : ""}`} role="status">
        <strong>Игра на паузе</strong><span>{mode}</span><small>{detail}</small>
    </section>;
}

function HistoryReviewPanel({state, app}) {
    if (!state.paused) return null;
    const review = state.historyReview || {entries: [], selected: null, actual: true, playing: false};
    const entries = review.entries || [];
    const isHost = state.userId === state.hostId;
    const rounds = [...new Set(entries.map((entry) => entry.round))].sort((left, right) => right - left);
    const selected = review.selected;
    const select = (entry) => app.socket.emit("select-history-register", {round: entry.round, register: entry.register});
    return <section className={`rr-panel history-review-panel ${review.actual ? "actual" : "reviewing"} ${review.playing ? "playing" : ""}`}
        aria-label="Журнал выполненных регистров">
        <div className="history-review-heading"><div><h2>Журнал ходов</h2><small>{review.actual ? "Показано актуальное состояние"
            : review.playing ? "Идёт общее воспроизведение" : "Все участники видят выбранный кадр"}</small></div>
            <span className="history-live-mark">{review.actual ? "СЕЙЧАС" : "АРХИВ"}</span></div>
        <div className="history-review-actions">
            <button type="button" className={review.playing ? "history-stop" : "history-play"}
                disabled={!isHost || !entries.length}
                title={!isHost ? "Историей управляет хост" : review.playing ? "Остановить воспроизведение" : "Проиграть с выбранного регистра"}
                onClick={() => app.socket.emit("set-history-playback", {playing: !review.playing})}>
                {review.playing ? "■ Остановить" : "▶ Проиграть"}
            </button>
            <button type="button" className="history-reset" disabled={!isHost || review.actual}
                title={!isHost ? "Историей управляет хост" : "Вернуть актуальное состояние"}
                onClick={() => app.socket.emit("reset-history-review", {reset: true})}>СБРОСИТЬ</button>
        </div>
        {entries.length ? <div className="history-rounds">{rounds.map((round) => <div className="history-round" key={round}>
            <strong>Раунд {round}</strong><div>{entries.filter((entry) => entry.round === round).map((entry) => {
                const active = selected && selected.round === entry.round && selected.register === entry.register;
                return <button type="button" key={`${entry.round}-${entry.register}`} className={active ? "active" : ""}
                    aria-current={active ? "step" : undefined} disabled={!isHost}
                    title={!isHost ? "Выбранный хостом кадр" : `Состояние перед регистром ${entry.register}`}
                    onClick={() => select(entry)}>Регистр {entry.register}</button>;
            })}</div>
        </div>)}</div> : <p className="history-empty">Выполненных регистров пока нет.</p>}
        {!isHost ? <small className="history-read-only">Просмотром управляет хост.</small> : null}
    </section>;
}

function GamePauseControls({state, app}) {
    if (state.userId !== state.hostId || state.phase === "lobby" || state.phase === "finished") return null;
    return <section className="rr-panel game-pause-controls">
        <h2>Управление игрой</h2>
        <button type="button" className={state.paused ? "resume" : "pause"}
            aria-pressed={!!state.paused}
            onClick={() => app.socket.emit("set-paused", {paused: !state.paused})}>
            {state.paused ? "▶ Продолжить" : "Ⅱ Пауза"}
        </button>
        {state.paused ? <button type="button" onClick={app.openGameSettings}>⚙ Настройки</button> : null}
    </section>;
}

function ConveyorDemoBoard({kind}) {
    const floorId = `conveyor-floor-${kind}`;
    const cells = [];
    for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++)
        cells.push(<rect key={`${column}-${row}`} x={50 + column * 80} y={30 + row * 80} width="80" height="80" fill={`url(#${floorId})`}/>);
    const robotClass = kind === "belt" ? "conveyor-demo-good-robot" : "conveyor-demo-card-robot";
    const initialFacing = kind === "belt" ? 0 : 90;
    return <svg className="conveyor-demo-svg" viewBox="0 0 420 285" role="img"
        aria-label={kind === "belt" ? "Конвейер привозит робота на поворот и разворачивает его на девяносто градусов"
            : "Карта движения приводит робота на поворот, после чего конвейер перемещает его без разворота"}>
        <defs><linearGradient id={floorId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7b8992"/><stop offset="1" stopColor="#56636c"/></linearGradient></defs>
        <g className="conveyor-demo-floor">{cells}</g>
        <g className="conveyor-demo-belt">
            {[50,130].map((x) => <g key={x}><rect x={x + 2} y="32" width="76" height="76"/><path className="conveyor-demo-rollers" d={`M${x + 7} 38H${x + 73}M${x + 7} 102H${x + 73}`}/><path className="conveyor-demo-arrow" d={`M${x + 17} 61H${x + 43}V52L${x + 64} 70L${x + 43} 88V79H${x + 17}Z`}/></g>)}
            <g><rect x="212" y="32" width="76" height="76"/><path className="conveyor-demo-rollers" d="M217 38H282M282 38V103"/>
                <path className="conveyor-demo-arrow" d="M226 65H247Q268 65 268 86V91M258 88L268 100L278 88"/></g>
            {[112,192].map((y) => <g key={y}><rect x="212" y={y} width="76" height="76"/><path className="conveyor-demo-rollers" d={`M218 ${y + 5}V${y + 71}M282 ${y + 5}V${y + 71}`}/><path className="conveyor-demo-arrow" d={`M241 ${y + 16}V${y + 42}H232L250 ${y + 63}L268 ${y + 42}H259V${y + 16}Z`}/></g>)}
        </g>
        <g className="conveyor-demo-program-card"><rect x="316" y="187" width="82" height="63" rx="8"/><text x="326" y="207">Вперёд 2</text><path d="M357 238V216M348 225L357 216L366 225"/></g>
        <g className={robotClass} key={kind}><g className="conveyor-demo-robot" style={{"--rr-facing": `${initialFacing}deg`}}>
            <circle r="25"/><circle className="inner" r="20"/><path d="M0-16L13 1H6V15H-6V1H-13Z"/></g></g>
        {kind === "belt" ? <g className="conveyor-demo-turn-mark"><path d="M224 42A34 34 0 0 1 282 72"/><path d="M270 67L282 72L279 59"/></g>
            : <g className="conveyor-demo-no-turn"><path d="M224 42A34 34 0 0 1 282 72"/><path d="M230 40L285 82"/></g>}
    </svg>;
}

class ConveyorGuideModal extends React.Component {
    constructor(props) {
        super(props);
        this.dialogRef = React.createRef();
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    componentDidUpdate(previousProps) {
        if (this.props.open && !previousProps.open) {
            this.returnFocus = this.props.returnFocus || document.activeElement;
            this.previousOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            document.addEventListener("keydown", this.handleKeyDown);
            requestAnimationFrame(() => {
                const close = this.dialogRef.current && this.dialogRef.current.querySelector(".guide-close");
                if (close) close.focus();
            });
        } else if (!this.props.open && previousProps.open) this.releaseModal();
    }

    componentWillUnmount() { if (this.props.open) this.releaseModal(); }

    releaseModal() {
        document.removeEventListener("keydown", this.handleKeyDown);
        document.body.style.overflow = this.previousOverflow || "";
        if (this.returnFocus && document.contains(this.returnFocus)) this.returnFocus.focus();
    }

    handleKeyDown(event) {
        if (event.key === "Escape") { event.preventDefault(); this.props.onClose(); return; }
        if (event.key !== "Tab" || !this.dialogRef.current) return;
        const focusable = [...this.dialogRef.current.querySelectorAll("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    render() {
        if (!this.props.open) return null;
        return <div className="guide-backdrop conveyor-guide-backdrop" onClick={(event) => event.target === event.currentTarget && this.props.onClose()}>
            <section className="guide-modal conveyor-guide-modal" role="dialog" aria-modal="true" aria-labelledby="conveyor-guide-title" ref={this.dialogRef}>
                <header className="guide-modal-header conveyor-guide-header"><div><h2 id="conveyor-guide-title">Как поворачивают конвейеры</h2></div>
                    <button type="button" className="guide-close" aria-label="Закрыть подсказку о конвейерах" onClick={this.props.onClose}>×</button></header>
                <div className="guide-modal-content conveyor-guide-content">
                    <div className="conveyor-demo-grid">
                        <article><div className="conveyor-demo-verdict yes">ДА, ПОВОРАЧИВАЕТСЯ</div><h3>Конвейер привёз робота на поворот</h3>
                            <div className="conveyor-demo-stage"><ConveyorDemoBoard kind="belt"/></div>
                            <p>Робот заезжает с соседней ленты и поворачивается на 90° вместе с ней.</p></article>
                        <article><div className="conveyor-demo-verdict no">НЕТ, НЕ ПОВОРАЧИВАЕТСЯ</div><h3>Робот попал на поворот своей картой</h3>
                            <div className="conveyor-demo-stage"><ConveyorDemoBoard kind="card"/></div>
                            <p>Когда включится конвейер, робот поедет по стрелке, но продолжит смотреть туда же.</p></article>
                    </div>
                </div>
            </section>
        </div>;
    }
}

function MemberHostControls({state, userId}) {
    const isHost = state.userId === state.hostId;
    if (!isHost || userId === state.userId) return null;
    const isPlayer = state.playerSlots.includes(userId);
    const removeLabel = isPlayer ? "Перевести в зрители" : "Удалить зрителя";
    return <span className="member-host-controls">
        {state.onlinePlayers.includes(userId) ? <button type="button" className="member-admin-button" title="Передать хоста" aria-label="Передать хоста"
            onClick={(evt) => window.commonRoom.handleGiveHost(userId, evt)}><i className="material-icons member-admin-glyph" aria-hidden="true">vpn_key</i></button> : null}
        <button type="button" className="member-admin-button" title={removeLabel} aria-label={removeLabel}
            onClick={(evt) => window.commonRoom.handleRemovePlayer(userId, evt)}><i className="material-icons member-admin-glyph" aria-hidden="true">{isPlayer ? "person_off" : "delete_forever"}</i></button>
    </span>;
}

class Lobby extends React.Component {
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
        const missingPlayers = Math.max(2, state.course.min) - playerCount;
        const startHint = canStart ? (isHost ? "Курс и состав готовы — можно начинать" : "Все готовы к старту. Ожидаем хоста")
            : missingPlayers > 0 ? `Для старта нужно ещё игроков: ${missingPlayers}`
            : `На этом курсе максимум ${state.course.max} игроков. Выберите другой курс`;
        const usedColors = new Set(players.filter((userId) => userId !== state.userId)
            .map(colorFor));
        return <section className="lobby-shell lobby">
            <section className="lobby-intro rr-panel">
                <div className="lobby-intro-title"><div><h2>Лобби · {state.roomId}</h2>
                    <p>{isHost ? "Вы хост · " : ""}{isPlayer ? "Вы участвуете в заезде" : "Вы смотрите за подготовкой"}</p></div>
                    <div className="lobby-intro-links"><button type="button" className="lobby-guide-button" onClick={this.props.onOpenGuide}>Как играть</button>
                    <button type="button" className="lobby-settings-button" onClick={this.props.onOpenSettings}>⚙ Настройки</button></div></div>
                <div className="lobby-primary-actions"><div className="role-actions" aria-label="Роль в комнате">
                        <button className={`lobby-role-button ${isPlayer ? "current-role" : "primary"}`} disabled={isPlayer || playerCount >= 8}
                            onClick={() => app.socket.emit("join-game")}>
                            {isPlayer ? "Вы в игре ✓" : "Присоединиться к игре"}</button>
                        <button className={`lobby-role-button ${!isPlayer ? "current-role" : ""}`} disabled={!isPlayer}
                            onClick={() => app.socket.emit("spectators-join")}>{isPlayer ? "Стать зрителем" : "Вы зритель"}</button>
                    </div>
                    <section className="lobby-start">
                        {isHost ? <button className="primary" aria-describedby="rr-lobby-next-step" disabled={!canStart} onClick={() => app.socket.emit("start-game")}>Начать игру</button>
                            : <span className="lobby-start-placeholder">Игру начнёт хост</span>}
                    </section>
                </div>
                <p className="rr-lobby-next-step" id="rr-lobby-next-step" role="status">{startHint}</p>
            </section>
            <section className="lobby-members rr-panel">
                <div className="member-column"><h3>Игроки <small>{playerCount}/8</small></h3>
                    {players.length ? players.map((userId) => <div className="lobby-member" key={userId}>
                        <i className="lobby-robot-color" style={{background: colorFor(userId)}}></i>
                        <span><PlayerName data={state} id={userId}/> {userId === state.hostId ? <small>хост</small> : null}</span>
                        <MemberHostControls state={state} userId={userId}/>
                        <em>старт {((state.startAssignments || {})[userId] ?? 0) + 1}</em>
                        {userId === state.userId ? <b>вы</b> : null}
                    </div>) : <p className="empty-members">Пока никто не присоединился.</p>}
                </div>
                <div className="member-column"><h3>Зрители <small>{spectators.length}</small></h3>
                    {spectators.length ? spectators.map((userId) => <div className="lobby-member spectator" key={userId}>
                        <span><PlayerName data={state} id={userId}/> {userId === state.hostId ? <small>хост</small> : null}</span>
                        <MemberHostControls state={state} userId={userId}/>
                        {userId === state.userId ? <b>вы</b> : null}
                    </div>) : <p className="empty-members">Нет зрителей.</p>}
                </div>
                {isPlayer ? <div className="color-picker"><h3>Цвет вашего робота</h3>
                    <div>{robotColors.map((color) => <button type="button" key={color}
                        className={colorFor(state.userId) === color ? "selected" : ""}
                        style={{"--swatch": color}} disabled={usedColors.has(color)}
                        title={usedColors.has(color) ? "Цвет занят" : "Выбрать цвет"}
                        aria-label={`Цвет ${color}`} aria-pressed={colorFor(state.userId) === color} onClick={() => app.socket.emit("select-color", color)}>{colorFor(state.userId) === color ? "✓" : ""}</button>)}</div>
                </div> : null}
            </section>
            <CourseSetup state={state} app={app} playerCount={playerCount} readOnly={!isHost}/>
        </section>;
    }
}

class GameOptionNumber extends React.Component {
    constructor(props) {
        super(props);
        this.state = {draft: String(props.value == null ? props.fallback : props.value)};
        this.commit = this.commit.bind(this);
    }

    componentDidUpdate(previousProps) {
        if (previousProps.value !== this.props.value && this.props.value !== null)
            this.setState({draft: String(this.props.value)});
    }

    commit() {
        if (!this.props.editable || this.props.value === null) return;
        const number = Number(this.state.draft);
        if (Number.isSafeInteger(number) && number > 0) this.props.onChange(number);
        else this.setState({draft: String(this.props.value)});
    }

    render() {
        const {value, fallback, editable, unit, label, onChange} = this.props;
        if (!editable) return <strong className="rr-option-value">{value === null ? (unit ? "Без таймера" : "∞") : `${value}${unit}`}</strong>;
        return <span className="rr-option-number">
            <button type="button" className={value !== null ? "selected" : ""} aria-pressed={value !== null}
                title={unit ? "Использовать таймер в секундах" : "Использовать ограничение жизней"}
                onClick={() => {
                    const draft = Number(this.state.draft);
                    onChange(Number.isSafeInteger(draft) && draft > 0 ? draft : fallback);
                }}>{unit ? "Секунды" : "Число"}</button>
            <input type="number" min="1" step="1" inputMode="numeric" aria-label={label}
                disabled={value === null} value={this.state.draft}
                onChange={(event) => this.setState({draft: event.target.value})} onBlur={this.commit}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}/>
            {unit ? <span>{unit}</span> : null}
            <button type="button" className={value === null ? "selected" : ""} aria-pressed={value === null}
                title={unit ? "Отключить таймер последнего игрока" : "Сделать жизни бесконечными для всех"}
                onClick={() => onChange(null)}>{unit ? "Без таймера" : "∞"}</button>
        </span>;
    }
}

function GameSettingsContent({state, app}) {
    const options = state.gameOptions || {startingLives: 3, lastPlayerSeconds: 30, powerDownMode: "classic", finishAllFlags: false};
    const editable = state.userId === state.hostId;
    const setOption = (key, setting) => app.socket.emit("set-game-option", {key, setting});
    const classicHelp = "Classic: объявите Power Down вместе с программой; текущий раунд выполняется полностью, робот отключится в следующем.";
    const simpleHelp = "Simple: вместо программы подтвердите Power Down; робот отключится уже в текущем раунде.";
    return <div className="rr-game-options">
        <div className="rr-game-options-body">
            <div className="rr-option-row"><div className="rr-option-name"><strong>Жизни</strong>
                <span className="rr-option-help" tabIndex="0" title="Число жизней у робота в начале партии. При уменьшении лимита текущие жизни обрезаются; увеличение их не восстанавливает. ∞ сразу даёт всем бесконечные жизни и выключает ручную правку. При числовом лимите хост может менять жизни любого игрока через кнопку ♥." aria-label="Пояснение к числу жизней">ⓘ</span></div>
                <GameOptionNumber value={options.startingLives} fallback={3} editable={editable} label="Число жизней"
                    unit="" onChange={(setting) => setOption("startingLives", setting)}/></div>
            <div className="rr-option-row"><div className="rr-option-name"><strong>Последний игрок</strong>
                <span className="rr-option-help" tabIndex="0" title="Когда готовыми стали все, кроме одного, запускается этот таймер. Выкл: можно отменять готовность, пока не готовы все. Особый общий таймер курса действует отдельно." aria-label="Пояснение к таймеру">ⓘ</span></div>
                <GameOptionNumber value={options.lastPlayerSeconds} fallback={30} editable={editable} label="Таймер последнего игрока, секунд"
                    unit="с" onChange={(setting) => setOption("lastPlayerSeconds", setting)}/></div>
            <div className="rr-option-row rr-option-power"><div className="rr-option-name"><strong>Power Down</strong>
                <span className="rr-option-help" tabIndex="0" title={`${classicHelp} ${simpleHelp} Доступен повреждённому роботу.`} aria-label="Пояснение к режимам Power Down">ⓘ</span></div>
                <div className="rr-option-modes" role="group" aria-label="Режим Power Down">
                    {["classic", "simple"].map((mode) => <button key={mode} type="button"
                        className={options.powerDownMode === mode ? "selected" : ""} aria-pressed={options.powerDownMode === mode}
                        title={mode === "classic" ? classicHelp : simpleHelp} disabled={!editable}
                        onClick={() => setOption("powerDownMode", mode)}>{mode}</button>)}
                </div></div>
            <div className="rr-option-row"><div className="rr-option-name"><strong>Доиграть флаги</strong>
                <span className="rr-option-help" tabIndex="0" title="После первого финиша остальные роботы продолжают игру. Финишировавший робот больше не участвует. Игра завершится, когда все оставшиеся соберут флаги или останется один выживший." aria-label="Пояснение к доигрыванию флагов">ⓘ</span></div>
                <div className="rr-option-modes" role="group" aria-label="Завершение игры после флагов">
                    <button type="button" className={!options.finishAllFlags ? "selected" : ""} aria-pressed={!options.finishAllFlags}
                        disabled={!editable} onClick={() => setOption("finishAllFlags", false)}>Первый финиш</button>
                    <button type="button" className={options.finishAllFlags ? "selected" : ""} aria-pressed={!!options.finishAllFlags}
                        disabled={!editable} onClick={() => setOption("finishAllFlags", true)}>Доиграть всем</button>
                </div></div>
            <p className="rr-options-effective">{state.phase === "lobby" ? "Настройки сохраняются для этой комнаты." : "Лимит жизней, таймер и флаги — сразу; режим Power Down — со следующего раунда."}</p>
        </div>
    </div>;
}

function GameSettingsModal({open, state, app, onClose, returnFocus}) {
    const dialogRef = React.useRef(null);
    React.useEffect(() => {
        if (!open) return undefined;
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const close = dialogRef.current && dialogRef.current.querySelector(".rr-settings-close");
        if (close) close.focus();
        const onKeyDown = (event) => {
            if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
            if (event.key !== "Tab" || !dialogRef.current) return;
            const elements = [...dialogRef.current.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
            if (!elements.length) return;
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.body.style.overflow = oldOverflow;
            if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
        };
    }, [open, onClose, returnFocus]);
    if (!open) return null;
    return <div className="rr-settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className="rr-settings-modal rr-panel" role="dialog" aria-modal="true" aria-labelledby="rr-settings-title" ref={dialogRef}>
            <header><h2 id="rr-settings-title">Настройки игры</h2><button type="button" className="rr-settings-close" aria-label="Закрыть настройки" onClick={onClose}>×</button></header>
            <GameSettingsContent state={state} app={app}/>
        </section>
    </div>;
}

const EDITOR_ART = "/roborally/assets/editor/";
const EDITOR_DIRECTIONS = ["north", "east", "south", "west"];
const EDITOR_TOOLS = [["conveyor","Конвейер"],["pit","Яма"],["wall","Стена"],["laser","Лазер"],
    ["pusher","Толкатель"],["gear","Шестерня"],["repair","Ремонт"],["flag","Флаг"],["erase","Ластик"]];

function EditorToolIcon({tool, gearTurn = 1, express = false}) {
    const sprite = tool === "conveyor" ? (express ? "express-straight" : "belt-straight")
        : tool === "gear" ? (gearTurn === 1 ? "gear-right" : "gear-left")
            : tool === "repair" ? "repair" : null;
    if (sprite) return <span className="rr-editor-tool-icon rr-editor-tool-sprite" aria-hidden="true"
        style={{backgroundImage: `url(${EDITOR_ART}${sprite}.webp)`}}/>;
    return <svg className="rr-editor-tool-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="36" height="36" rx="3" fill="#9ca8ab" stroke="#d0d5cf" strokeWidth="2"/>
        {tool === "pit" ? <rect x="4" y="4" width="32" height="32" rx="2" fill="#080b0e"/> : null}
        {tool === "wall" ? <React.Fragment><path d="M6 7h28" stroke="#2b2a22" strokeWidth="8"/><path d="M6 5h28" stroke="#f4ce4b" strokeWidth="3" strokeDasharray="5 3"/></React.Fragment> : null}
        {tool === "laser" ? <React.Fragment><path d="M5 7h30" stroke="#242626" strokeWidth="8"/><path d="M7 5h26" stroke="#f7c83d" strokeWidth="2" strokeDasharray="4 3"/><circle cx="20" cy="10" r="4" fill="#f35e5c"/><path d="M20 13v24" stroke="#ff3f46" strokeWidth="2.5"/><path d="M18 13v24" stroke="#ffaaaa" strokeWidth="1"/></React.Fragment> : null}
        {tool === "pusher" ? <React.Fragment><path d="M6 7h28" stroke="#252720" strokeWidth="8"/><path d="M7 5h26" stroke="#f5c74b" strokeWidth="2" strokeDasharray="4 3"/><path d="M14 13v10h-5l11 10 11-10h-5V13z" fill="#edbd48" stroke="#282421" strokeWidth="2"/></React.Fragment> : null}
        {tool === "flag" ? <React.Fragment><path d="M13 33V7" stroke="#233132" strokeWidth="3"/><path d="M15 8h19l-5 8 5 8H15z" fill="#7ad864" stroke="#224e31" strokeWidth="2"/><path d="M20 16l7 6m-5-10l6 7" stroke="#20392c" strokeWidth="2" strokeLinecap="round"/><circle cx="13" cy="33" r="3" fill="#243536"/></React.Fragment> : null}
        {tool === "erase" ? <React.Fragment><path d="M8 25 23 8l11 11-15 16H11z" fill="#e7afa7" stroke="#413a42" strokeWidth="2"/><path d="m15 17 11 11" stroke="#fff1e9" strokeWidth="2"/><path d="M7 35h26" stroke="#46535b" strokeWidth="2"/></React.Fragment> : null}
    </svg>;
}

function customCellStyle(x, y, rows = 12) {
    return {left: `${x / 12 * 100}%`, top: `${y / rows * 100}%`, width: `${100 / 12}%`, height: `${100 / rows}%`};
}

function conveyorInlets(features, key) {
    const [x, y] = keyPoint(key);
    const walls = new Set(features.walls || []);
    return EDITOR_DIRECTIONS.filter((direction) => {
        const [dx, dy] = FIELD_VECTORS[direction];
        const sourceX = x - dx, sourceY = y - dy;
        const from = `${sourceX},${sourceY}`;
        if (features.conveyors[from] !== direction) return false;
        if (features.conveyors[key] === OPPOSITE_DIRECTION[direction]) return false;
        if (Array.isArray(features.connections) && !features.connections.includes(`${from}|${key}`)) return false;
        return !walls.has(`${sourceX},${sourceY},${direction}`)
            && !walls.has(`${x},${y},${OPPOSITE_DIRECTION[direction]}`);
    });
}

function conveyorArt(features, key, inbound = conveyorInlets(features, key)) {
    const outgoing = features.conveyors[key];
    const express = (features.express || []).includes(key);
    const angle = (EDITOR_DIRECTIONS.indexOf(outgoing) - EDITOR_DIRECTIONS.indexOf("east") + 4) % 4 * 90;
    const prefix = express ? "express" : "belt";
    const sides = inbound.filter((direction) => direction !== outgoing);
    if (!sides.length) return {sprite: `${prefix}-straight`, transform: `rotate(${angle}deg)`, junction: false};
    const sprite = sides.length === 2 ? (inbound.length === 3 ? "triple-merge" : "double-turn")
        : inbound.length === 2 ? "merge" : "turn";
    const canonicalSource = express && sprite === "turn" ? "south" : "north";
    const sideIndex = (EDITOR_DIRECTIONS.indexOf(OPPOSITE_DIRECTION[sides[0]])
        - EDITOR_DIRECTIONS.indexOf(outgoing) + 4) % 4;
    const mirrored = sides.length === 1 && (sideIndex === 1 ? canonicalSource === "north" : canonicalSource === "south");
    return {sprite: `${prefix}-${sprite}`, transform: `rotate(${angle}deg)${mirrored ? " scaleY(-1)" : ""}`, junction: true};
}

function CustomFactoryArt({features, starts = []}) {
    if (!features) return null;
    const rows = features.fullField ? 16 : 12;
    const pits = new Set(features.pits || []);
    const walls = new Set(features.walls || []);
    const physicalWalls = [...new Map([...walls].map((wall) => [physicalWallId(wall), wall])).values()];
    const tile = (name, key, transform = "", junction = false) => {
        const [x, y] = keyPoint(key);
        return <img key={`${name}-${key}`} className={`rr-custom-tile${junction ? " rr-custom-junction" : ""}`} draggable="false" alt=""
            style={{...customCellStyle(x, y, rows), transform}} src={`${EDITOR_ART}${name}.webp`}/>;
    };
    return <div className={`rr-custom-factory ${rows === 16 ? "rr-custom-full-field" : ""}`} aria-hidden="true">
        {rows === 16 ? starts.map(({x,y}, index) => <span key={`start-${index}`}
            className="rr-custom-start-number" style={customCellStyle(x,y,rows)}><b>{index+1}</b></span>) : null}
        {(features.pits || []).map((key) => {
            const [x,y] = keyPoint(key);
            const border = "max(2px,.28cqw) solid #dfc334";
            return <div key={`pit-${key}`} className="rr-custom-pit" style={{...customCellStyle(x,y,rows),
                borderTop: pits.has(`${x},${y-1}`) ? 0 : border,
                borderRight: pits.has(`${x+1},${y}`) ? 0 : border,
                borderBottom: pits.has(`${x},${y+1}`) ? 0 : border,
                borderLeft: pits.has(`${x-1},${y}`) ? 0 : border}}/>;
        })}
        {Object.entries(features.conveyors || {}).map(([key]) => {
            const inbound = conveyorInlets(features, key), art = conveyorArt(features, key, inbound);
            return tile(art.sprite, key, art.transform, art.junction);
        })}
        {(features.repairs || []).map((key) => tile("repair", key))}
        {Object.entries(features.gears || {}).map(([key, turn]) => tile(turn === 1 ? "gear-right" : "gear-left", key))}
        <svg className="rr-custom-lines" viewBox={`0 0 12 ${rows}`} preserveAspectRatio="none">
            {(features.lasers || []).flatMap((laser, index) => laserLines(laser, walls).map((line, beam) =>
                <line key={`beam-${index}-${beam}`} className="rr-custom-beam" x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]}/>))}
            {physicalWalls.map((wall) => {
                const [x,y,direction] = wall.split(",");
                const [x1,y1,x2,y2] = wallLine(Number(x), Number(y), direction);
                return <g key={physicalWallId(wall)}><line className="rr-custom-wall-base" x1={x1} y1={y1} x2={x2} y2={y2}/>
                    <line className="rr-custom-wall-stripe" x1={x1} y1={y1} x2={x2} y2={y2}/></g>;
            })}
        </svg>
        {(features.lasers || []).map((laser, index) => <span key={`emitter-${index}`} className="rr-custom-emitter"
            style={{left: `${(laser.x + .5 - FIELD_VECTORS[laser.direction][0] * .43) / 12 * 100}%`,
                top: `${(laser.y + .5 - FIELD_VECTORS[laser.direction][1] * .43) / rows * 100}%`}}/>)}
        {(features.pushers || []).map((pusher, index) => {
            const peers = (features.pushers || []).filter((other) => other !== pusher
                && other.x === pusher.x && other.y === pusher.y);
            const hasPeer = (direction) => peers.some((other) => other.direction === direction);
            const alongWallX = (pusher.direction === "north" || pusher.direction === "south")
                ? (hasPeer("west") ? -.13 : 0) + (hasPeer("east") ? .13 : 0) : 0;
            const alongWallY = (pusher.direction === "east" || pusher.direction === "west")
                ? (hasPeer("north") ? -.13 : 0) + (hasPeer("south") ? .13 : 0) : 0;
            const consecutive = pusher.active.length >= 4
                && pusher.active.every((register, position) => register === pusher.active[0] + position);
            const label = consecutive ? [pusher.active[0], "–", pusher.active.at(-1)] : pusher.active;
            return <span key={`pusher-${index}`}
                className={`rr-custom-pusher rr-custom-pusher-${pusher.direction}`}
                title={`Толкатель: регистры ${pusher.active.join(", ")}`}
                style={{left: `${(pusher.x + .5 - FIELD_VECTORS[pusher.direction][0] * .29 + alongWallX) / 12 * 100}%`,
                    top: `${(pusher.y + .5 - FIELD_VECTORS[pusher.direction][1] * .29 + alongWallY) / rows * 100}%`}}>
                {label.map((register, position) => <span key={position}>{register}</span>)}</span>;
        })}
    </div>;
}

function FlagMarker({number, className = "", style}) {
    return <span className={`flag ${className}`} style={style}>
        <span className="flag-cloth">{number}</span><span className="flag-wrench"/>
    </span>;
}

const BOARD_VIEW_STORAGE_KEY = "roborally-board-view-angle";

function boardViewClass(angle) {
    return `rr-view-frame${angle % 180 ? " rr-view-landscape" : ""}`;
}

function boardViewStyle(angle) {
    return {"--rr-view-angle": `${angle}deg`};
}

// Return coordinates in the unchanged 12×16 field, regardless of its screen rotation.
function boardPointFromView(element, angle, clientX, clientY) {
    const rect = element.getBoundingClientRect();
    const u = (clientX - rect.left - element.clientLeft) / element.clientWidth;
    const v = (clientY - rect.top - element.clientTop) / element.clientHeight;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
    const [x, y] = angle === 90 ? [v, 1 - u] : angle === 180 ? [1 - u, 1 - v]
        : angle === 270 ? [1 - v, u] : [u, v];
    return {fx: Math.min(12 - 1e-6, x * 12), fy: Math.min(16 - 1e-6, y * 16)};
}

function BoardViewControls({app}) {
    const angle = app.boardViewAngle();
    const automatic = app.state.boardViewChoice === null;
    return <div className="rr-view-controls" role="group" aria-label="Повернуть вид поля">
        <button type="button" aria-label="Повернуть вид против часовой стрелки" title="Повернуть вид против часовой стрелки"
            onClick={() => app.rotateBoardView(-90)}>↺</button>
        <span>{angle}°</span>
        <button type="button" aria-label="Повернуть вид по часовой стрелке" title="Повернуть вид по часовой стрелке"
            onClick={() => app.rotateBoardView(90)}>↻</button>
        <button type="button" className={automatic ? "selected" : ""} aria-label="Автоматический ракурс поля"
            aria-pressed={automatic} title="Авто: на широком экране старт слева, на узком снизу"
            onClick={() => app.resetBoardViewAngle()}>Авто</button>
    </div>;
}

const DOCK_EDGES = {left: "Слева", right: "Справа", top: "Сверху", bottom: "Снизу"};

function dockEdgeAt(clientX, clientY) {
    const horizontal = Math.min(clientX, window.innerWidth - clientX) / window.innerWidth;
    const vertical = Math.min(clientY, window.innerHeight - clientY) / window.innerHeight;
    const edge = horizontal < vertical ? (clientX < window.innerWidth / 2 ? "left" : "right")
        : clientY < window.innerHeight / 2 ? "top" : "bottom";
    return window.innerWidth <= 760 && edge === "left" ? "top"
        : window.innerWidth <= 760 && edge === "right" ? "bottom" : edge;
}

function DockPlacementControl({app, panel, effectivePosition}) {
    const name = panel === "info" ? "информационную панель" : "панель программирования";
    return <button type="button" className="rr-dock-placement rr-dock-drag-handle"
        aria-label={`Перетащить ${name}`}
        title={`Перетащить ${name} · сейчас ${DOCK_EDGES[effectivePosition].toLowerCase()}`}
        onPointerDown={(event) => app.beginDockPointerDrag(panel, event)}
        onPointerMove={(event) => app.moveDockPointerDrag(event)}
        onPointerUp={(event) => app.endDockPointerDrag(event)}
        onPointerCancel={(event) => app.endDockPointerDrag(event, true)}>⠿</button>;
}

function CourseFieldContents({course, state, flagClassName, showLobbyRobots = false}) {
    const assignments = state.startAssignments || {};
    const startPositions = state.startPositions || [];
    const players = (state.playerSlots || []).filter(Boolean);
    return <React.Fragment>
        {course.customFeatures ? <div className={`course-thumbnail-factory ${course.customFeatures.fullField ? "rr-full-field" : ""}`}>
            <CustomFactoryArt features={course.customFeatures}
                starts={(state.startTemplates?.[course.start]?.starts || [])}/></div>
            : <img className="course-thumbnail-factory" draggable="false" style={{transform: `rotate(${course.rotation || 0}deg)`}}
                src={boardImageUrl(state, course.board)}/>}
        {!course.customFeatures?.fullField ? <img className="course-thumbnail-start" draggable="false"
            src={startImageUrl(state, course.start || state.startCards[1])}/>
            : null}
        {(course.flags || []).map(([x, y], index) => <i className={flagClassName || ""} key={`${x}-${y}-${index}`}
            style={{left: `${(x + .5) / 12 * 100}%`, top: `${(y + .5) / 16 * 100}%`}}>{index + 1}</i>)}
        {showLobbyRobots ? players.map((userId) => {
            const start = assignments[userId];
            const position = startPositions[start];
            if (!position) return null;
            const color = (state.playerColors || {})[userId] || (state.robotColors || LOBBY_ROBOT_COLORS)[start];
            return <span className="course-preview-robot" data-start={start + 1} data-user-id={userId} key={userId}
                title={`${playerName(state, userId)}: старт ${start + 1}`}
                style={{left: `${(position.x + .5) / 12 * 100}%`, top: `${(position.y + .5) / 16 * 100}%`, "--robot-color": color}}>
                <b>↑</b><small>{start + 1}</small>
            </span>;
        }) : null}
    </React.Fragment>;
}

function CourseThumbnail({course, state, app}) {
    const angle = app.boardViewAngle();
    return <span className={`course-thumbnail ${boardViewClass(angle)}`} style={boardViewStyle(angle)}>
        <span className="rr-view-canvas"><CourseFieldContents course={course} state={state}/></span>
    </span>;
}

class SpecialRuleMarker extends React.Component {
    constructor(props) {
        super(props);
        this.state = {open: false, left: 10, top: 10, above: false};
        this.marker = React.createRef();
        this.show = this.show.bind(this);
        this.hide = this.hide.bind(this);
        this.reposition = this.reposition.bind(this);
    }

    reposition() {
        if (!this.marker.current) return;
        const rect = this.marker.current.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 20);
        this.setState({
            left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)),
            top: rect.top > window.innerHeight / 2 ? rect.top - 7 : rect.bottom + 7,
            above: rect.top > window.innerHeight / 2});
    }

    show() {
        this.setState({open: true});
        this.reposition();
        window.addEventListener("resize", this.reposition);
        window.addEventListener("scroll", this.reposition, true);
    }

    hide() {
        window.removeEventListener("resize", this.reposition);
        window.removeEventListener("scroll", this.reposition, true);
        this.setState({open: false});
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.reposition);
        window.removeEventListener("scroll", this.reposition, true);
    }

    render() {
        return <React.Fragment>
            <span ref={this.marker} className="special-rule-marker" aria-label={`Special Rules: ${this.props.description}`}
                onMouseEnter={this.show} onMouseLeave={this.hide} onFocus={this.show} onBlur={this.hide}>Special Rules</span>
            {this.state.open ? ReactDOM.createPortal(<div className="rr-special-rule-popover" role="tooltip"
                style={{left: this.state.left, top: this.state.top,
                    transform: this.state.above ? "translateY(-100%)" : "none"}}>{this.props.description}</div>, document.body) : null}
        </React.Fragment>;
    }
}

function emptyEditableFeatures() {
    return {fullField: true, pits: [], repairs: [], gears: {}, conveyors: {}, express: [], hintConnections: [], connections: [], walls: [], lasers: [], pushers: []};
}

function cloneEditableFeatures(features) {
    return JSON.parse(JSON.stringify(features));
}

function factoryPart(features) {
    const onFactory = (key) => keyPoint(key)[1] < 12;
    return {...emptyEditableFeatures(), pits: features.pits.filter(onFactory), repairs: features.repairs.filter(onFactory),
        gears: Object.fromEntries(Object.entries(features.gears).filter(([key]) => onFactory(key))),
        conveyors: Object.fromEntries(Object.entries(features.conveyors).filter(([key]) => onFactory(key))),
        express: features.express.filter(onFactory),
        hintConnections: (features.hintConnections || []).filter((entry) => entry.split("|").every(onFactory)),
        connections: (features.connections || []).filter((entry) => entry.split("|").every(onFactory)),
        walls: features.walls.filter((entry) => onFactory(entry)),
        lasers: features.lasers.filter((item) => item.y < 12), pushers: features.pushers.filter((item) => item.y < 12)};
}

function withEditableStart(factory, startLayout) {
    const features = cloneEditableFeatures(factory);
    features.fullField = true;
    if (!startLayout) return features;
    features.conveyors = {...features.conveyors, ...startLayout.conveyors};
    features.express = [...new Set([...features.express, ...startLayout.express])];
    features.walls = [...new Set([...features.walls, ...startLayout.walls])];
    Object.entries(features.conveyors).forEach(([from, direction]) => {
        const [x,y] = keyPoint(from), [dx,dy] = FIELD_VECTORS[direction];
        const to = `${x+dx},${y+dy}`;
        if (y < 11 || !features.conveyors[to] || features.conveyors[to] === OPPOSITE_DIRECTION[direction]
            || features.walls.includes(`${from},${direction}`)
            || features.walls.includes(`${to},${OPPOSITE_DIRECTION[direction]}`)) return;
        const connection = `${from}|${to}`;
        if (!features.connections.includes(connection)) features.connections.push(connection);
    });
    return features;
}

function rotateEditableFactory(features, flags, clockwise) {
    const amount = clockwise ? 1 : 3;
    const point = (x,y) => y >= 12 ? [x,y] : clockwise ? [11-y,x] : [y,11-x];
    const key = (value) => point(...keyPoint(value)).join(",");
    const direction = (value) => EDITOR_DIRECTIONS[(EDITOR_DIRECTIONS.indexOf(value)+amount)%4];
    const connection = (value) => value.split("|").map(key).join("|");
    const sameSection = (value) => {
        const [from,to] = value.split("|");
        return (keyPoint(from)[1] < 12) === (keyPoint(to)[1] < 12);
    };
    const next = {...cloneEditableFeatures(features),
        pits: features.pits.map(key), repairs: features.repairs.map(key), express: features.express.map(key),
        gears: Object.fromEntries(Object.entries(features.gears).map(([cell,turn]) => [key(cell),turn])),
        conveyors: Object.fromEntries(Object.entries(features.conveyors).map(([cell,facing]) =>
            [key(cell),keyPoint(cell)[1] < 12 ? direction(facing) : facing])),
        walls: features.walls.map((wall) => {
            const [x,y,facing] = wall.split(",");
            const [nx,ny] = point(Number(x),Number(y));
            return `${nx},${ny},${Number(y) < 12 ? direction(facing) : facing}`;
        }),
        lasers: features.lasers.map((laser) => {
            const [x,y] = point(laser.x,laser.y);
            return {...laser,x,y,direction:laser.y < 12 ? direction(laser.direction) : laser.direction};
        }),
        pushers: features.pushers.map((pusher) => {
            const [x,y] = point(pusher.x,pusher.y);
            return {...pusher,x,y,direction:pusher.y < 12 ? direction(pusher.direction) : pusher.direction};
        }),
        hintConnections: (features.hintConnections || []).filter(sameSection).map(connection),
        connections: (features.connections || []).filter(sameSection).map(connection)};
    Object.entries(next.conveyors).forEach(([from,facing]) => {
        const [x,y] = keyPoint(from), [dx,dy] = FIELD_VECTORS[facing], targetY = y+dy;
        if (!((y === 11 && targetY === 12) || (y === 12 && targetY === 11))) return;
        const to = `${x+dx},${targetY}`;
        if (!next.conveyors[to] || next.conveyors[to] === OPPOSITE_DIRECTION[facing]) return;
        const boundary = physicalWallId(`${from},${facing}`);
        if (next.walls.some((wall) => physicalWallId(wall) === boundary)) return;
        const link = `${from}|${to}`;
        if (!next.connections.includes(link)) next.connections.push(link);
    });
    return {features: next, flags: flags.map(([x,y]) => point(x,y))};
}

function validateFieldImport(payload, state) {
    const fail = (message) => { throw new Error(message); };
    if (!payload || payload.format !== "roborally-web-field" || payload.version !== 1)
        fail("неподдерживаемый формат файла");
    const {name, start, features, flags} = payload;
    if (typeof name !== "string" || name.length > 50 || !state.startCards.includes(start)
        || !features || features.fullField !== true || !Array.isArray(flags)) fail("неверные общие данные поля");
    const cell = (key) => typeof key === "string" && /^\d{1,2},\d{1,2}$/.test(key)
        && keyPoint(key)[0] < 12 && keyPoint(key)[1] < 16;
    const direction = (value) => EDITOR_DIRECTIONS.includes(value);
    const cellList = (value) => Array.isArray(value) && value.length <= 192 && value.every(cell);
    const map = (value, check) => value && typeof value === "object" && !Array.isArray(value)
        && Object.entries(value).length <= 192 && Object.entries(value).every(([key,item]) => cell(key) && check(item));
    if (!cellList(features.pits) || !cellList(features.repairs) || !cellList(features.express)
        || !map(features.gears, (turn) => turn === 1 || turn === -1)
        || !map(features.conveyors, direction)
        || !Array.isArray(features.walls) || features.walls.length > 768
        || !features.walls.every((wall) => typeof wall === "string" && wall.split(",").length === 3
            && cell(wall.split(",").slice(0,2).join(",")) && direction(wall.split(",")[2]))
        || !Array.isArray(features.lasers) || features.lasers.length > 192
        || !features.lasers.every((laser) => laser && cell(`${laser.x},${laser.y}`)
            && Number.isInteger(laser.x) && Number.isInteger(laser.y)
            && direction(laser.direction) && [1,2,3].includes(laser.count))
        || !Array.isArray(features.pushers) || features.pushers.length > 192
        || !features.pushers.every((pusher) => pusher && cell(`${pusher.x},${pusher.y}`)
            && Number.isInteger(pusher.x) && Number.isInteger(pusher.y)
            && direction(pusher.direction) && Array.isArray(pusher.active) && pusher.active.length > 0
            && pusher.active.length <= 5 && pusher.active.every((register) => Number.isInteger(register) && register >= 1 && register <= 5)))
        fail("повреждён список элементов");
    if (features.pushers.some((pusher,index) => features.pushers.slice(0,index).some((other) =>
        other.x === pusher.x && other.y === pusher.y
        && (other.direction === pusher.direction || other.active.some((register) => pusher.active.includes(register))))))
        fail("толкатели на одной клетке срабатывают в одном регистре");
    const occupied = new Set(features.pits);
    if (features.repairs.some((key) => occupied.has(key)) || Object.keys(features.gears).some((key) => occupied.has(key))
        || Object.keys(features.conveyors).some((key) => occupied.has(key))
        || features.express.some((key) => !features.conveyors[key])
        || features.lasers.some(({x,y}) => occupied.has(`${x},${y}`))
        || features.pushers.some(({x,y}) => occupied.has(`${x},${y}`))) fail("элементы пересекаются с ямой");
    const startLayout = state.startTemplates?.[start];
    if (!startLayout) fail("нет данных стартового поля");
    for (const {x,y} of startLayout.starts) {
        const key = `${x},${y}`;
        if (occupied.has(key) || features.repairs.includes(key) || Object.hasOwn(features.gears,key)
            || features.conveyors[key] !== startLayout.conveyors[key]
            || features.express.includes(key) !== startLayout.express.includes(key)
            || features.lasers.some((laser) => laser.x === x && laser.y === y)
            || features.pushers.some((pusher) => pusher.x === x && pusher.y === y))
            fail("изменена стартовая клетка");
    }
    const connections = features.connections || [];
    const hints = features.hintConnections || [];
    if (!Array.isArray(connections) || connections.length > 384 || !Array.isArray(hints)
        || hints.length > 384 || !hints.every((entry) => typeof entry === "string"
            && entry.split("|").length === 2 && entry.split("|").every(cell))
        || !connections.every((entry) => {
            if (typeof entry !== "string") return false;
            const [from,to,...rest] = entry.split("|");
            if (rest.length || !cell(from) || !cell(to) || !features.conveyors[from]
                || !features.conveyors[to]) return false;
            const [x,y] = keyPoint(from), [tx,ty] = keyPoint(to), dir = features.conveyors[from];
            const [dx,dy] = FIELD_VECTORS[dir];
            return x+dx === tx && y+dy === ty && features.conveyors[to] !== OPPOSITE_DIRECTION[dir]
                && !features.walls.some((wall) => physicalWallId(wall) === physicalWallId(`${from},${dir}`));
        })) fail("неверные связи конвейеров");
    if (flags.length > 8 || !flags.every((flag) => Array.isArray(flag) && flag.length === 2
        && flag.every(Number.isInteger) && cell(flag.join(",")) && !occupied.has(flag.join(","))
        && !startLayout.starts.some((point) => point.x === flag[0] && point.y === flag[1]))
        || new Set(flags.map((flag) => flag.join(","))).size !== flags.length) fail("неверные позиции флагов");
    const cleanFeatures = cloneEditableFeatures(features);
    cleanFeatures.walls = cleanFeatures.walls.filter((wall) => !wallBetweenPits(occupied, wall));
    cleanFeatures.connections = [...connections];
    cleanFeatures.hintConnections = [...hints];
    return {name, start, sourceBoard: Object.hasOwn(state.boardTemplates || {},payload.sourceBoard)
        ? payload.sourceBoard : "", rotation: [0,90,180,270].includes(payload.rotation) ? payload.rotation : 0,
        features: cleanFeatures, flags: flags.map((flag) => [...flag])};
}

function editorCellWithoutDevice(features, key) {
    features.pits = features.pits.filter((item) => item !== key);
    features.repairs = features.repairs.filter((item) => item !== key);
    features.express = features.express.filter((item) => item !== key);
    delete features.gears[key];
    delete features.conveyors[key];
    features.connections = (features.connections || []).filter((entry) => {
        const [from,to] = entry.split("|");
        return from !== key && to !== key;
    });
    const [x,y] = keyPoint(key);
    features.lasers = features.lasers.filter((item) => item.x !== x || item.y !== y);
    features.pushers = features.pushers.filter((item) => item.x !== x || item.y !== y);
}

function editorRemoveConnectionsAcrossWall(features, wall) {
    const boundary = physicalWallId(wall);
    features.connections = (features.connections || []).filter((entry) => {
        const [from,to] = entry.split("|");
        const [x,y] = keyPoint(from), [tx,ty] = keyPoint(to);
        const direction = EDITOR_DIRECTIONS.find((candidate) => {
            const [dx,dy] = FIELD_VECTORS[candidate];
            return x+dx === tx && y+dy === ty;
        });
        return !direction || physicalWallId(`${from},${direction}`) !== boundary;
    });
}

function editorRemoveWalls(features, boundaries) {
    features.walls = features.walls.filter((wall) => !boundaries.has(physicalWallId(wall)));
    features.lasers = features.lasers.filter((laser) =>
        !boundaries.has(physicalWallId(`${laser.x},${laser.y},${OPPOSITE_DIRECTION[laser.direction]}`)));
    features.pushers = features.pushers.filter((pusher) =>
        !boundaries.has(physicalWallId(`${pusher.x},${pusher.y},${OPPOSITE_DIRECTION[pusher.direction]}`)));
}

class FieldEditorModal extends React.Component {
    constructor(props) {
        super(props);
        const course = props.state.course;
        const start = course.start || props.state.startCards[1];
        const sourceFeatures = course.customFeatures ? cloneEditableFeatures(course.customFeatures) : emptyEditableFeatures();
        const initial = {name: course.customFeatures ? course.name : "Моё поле",
            start,
            sourceBoard: course.customFeatures && Object.hasOwn(props.state.boardTemplates || {},course.board) ? course.board : "",
            rotation: course.editorRotation || 0,
            features: course.customFeatures?.fullField ? sourceFeatures
                : withEditableStart(sourceFeatures, props.state.startTemplates?.[start]),
            flags: course.customFeatures ? course.flags.map((flag) => [...flag]) : [],
            tool: "conveyor", express: false, gearTurn: 1, laserCount: 1,
            notice: "",
            pusherRegisters: [1,3,5], drawing: [], history: [], future: []};
        this.state = props.draft ? {...props.draft, drawing: []} : initial;
        this.dialogRef = React.createRef();
        this.importRef = React.createRef();
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    componentDidMount() {
        this.previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", this.handleKeyDown);
        requestAnimationFrame(() => this.dialogRef.current?.querySelector(".rr-editor-close")?.focus());
    }

    componentWillUnmount() {
        document.body.style.overflow = this.previousOverflow || "";
        document.removeEventListener("keydown", this.handleKeyDown);
        if (this.props.returnFocus && document.contains(this.props.returnFocus)) this.props.returnFocus.focus();
    }

    handleKeyDown(event) {
        if (event.key === "Escape") { event.preventDefault(); this.close(); return; }
        if ((event.ctrlKey || event.metaKey) && (event.code === "KeyZ" || event.code === "KeyY")) {
            if (["INPUT","TEXTAREA"].includes(event.target.tagName) && event.target.type !== "file") return;
            event.preventDefault();
            if (event.shiftKey || event.code === "KeyY") this.redo();
            else this.undo();
            return;
        }
        if (event.key !== "Tab" || !this.dialogRef.current) return;
        const focusable = [...this.dialogRef.current.querySelectorAll("button:not([disabled]),input,select")];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    close() {
        this.props.onClose({...this.state, drawing: []});
    }

    exportField() {
        const payload = {format: "roborally-web-field", version: 1, name: this.state.name,
            start: this.state.start, sourceBoard: this.state.sourceBoard, rotation: this.state.rotation,
            features: this.state.features, flags: this.state.flags};
        const blob = new Blob([JSON.stringify(payload,null,2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `RoboRally-${(this.state.name.trim() || "поле").replace(/[^a-zA-Z0-9А-Яа-яЁё-]+/g,"-")}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.setState({notice: "Поле экспортировано в JSON."});
    }

    async importField(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            if (file.size > 256 * 1024) throw new Error("файл слишком большой");
            const imported = validateFieldImport(JSON.parse(await file.text()), this.props.state);
            this.commit(() => ({...imported, notice: "Поле импортировано. Проверьте его и выберите для игры."}));
        } catch (error) {
            this.setState({notice: `Импорт не выполнен: ${error instanceof SyntaxError ? "неверный JSON" : error.message}`});
        }
    }

    changeBoard(sourceBoard) {
        const template = sourceBoard ? this.props.state.boardTemplates[sourceBoard] : null;
        this.commit((current) => ({sourceBoard, features: withEditableStart(template || emptyEditableFeatures(),
            this.props.state.startTemplates?.[current.start]), flags: [], rotation: 0}));
    }

    clearBoard() {
        this.commit((current) => ({sourceBoard: "", rotation: 0, flags: [],
            features: withEditableStart(emptyEditableFeatures(), this.props.state.startTemplates?.[current.start]),
            notice: "Поле очищено. Действие можно отменить."}));
    }

    rotateBoard(clockwise) {
        this.commit((current) => ({...rotateEditableFactory(current.features,current.flags,clockwise),
            rotation: (current.rotation + (clockwise ? 90 : 270)) % 360,
            notice: "Основа повернута; проверьте соединения у границы стартового поля."}));
    }

    changeStart(start) {
        const template = this.props.state.startTemplates?.[start];
        this.commit((current) => ({start, features: withEditableStart(factoryPart(current.features), template),
            flags: current.flags.filter(([x,y]) => !template?.starts.some((point) => point.x === x && point.y === y))}));
    }

    isFixedStart(point) {
        return this.props.state.startTemplates?.[this.state.start]?.starts.some((start) =>
            start.x === point.x && start.y === point.y);
    }

    editableCellBoundaries(point) {
        return new Set(EDITOR_DIRECTIONS.map((side) => physicalWallId(`${point.key},${side}`)));
    }

    commit(change) {
        this.setState((current) => {
            const next = change(current);
            if (!next) return null;
            return {...next, history: [...current.history, {features: current.features, flags: current.flags,
                start: current.start, sourceBoard: current.sourceBoard, rotation: current.rotation}].slice(-40), future: []};
        });
    }

    undo() {
        this.setState((current) => {
            if (!current.history.length) return null;
            const previous = current.history[current.history.length - 1];
            return {...previous, history: current.history.slice(0,-1),
                future: [...current.future, {features: current.features, flags: current.flags,
                    start: current.start, sourceBoard: current.sourceBoard, rotation: current.rotation}]};
        });
    }

    redo() {
        this.setState((current) => {
            if (!current.future.length) return null;
            const next = current.future[current.future.length - 1];
            return {...next, future: current.future.slice(0,-1),
                history: [...current.history, {features: current.features, flags: current.flags,
                    start: current.start, sourceBoard: current.sourceBoard, rotation: current.rotation}]};
        });
    }

    point(event) {
        const point = boardPointFromView(event.currentTarget, this.props.app.boardViewAngle(), event.clientX, event.clientY);
        if (!point) return null;
        const {fx, fy} = point;
        const x = Math.floor(fx), y = Math.floor(fy);
        const edgeDistances = {north: fy - y, east: x + 1 - fx, south: y + 1 - fy, west: fx - x};
        const side = Object.entries(edgeDistances).sort((a,b) => a[1] - b[1])[0][0];
        return {x,y,side,edgeDistance: edgeDistances[side],key: `${x},${y}`};
    }

    beginDraw(event) {
        if (event.button !== 0) return;
        const point = this.point(event);
        if (!point || (this.isFixedStart(point) && this.state.tool !== "wall"
            && !(this.state.tool === "erase" && point.edgeDistance <= .18))) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        this.drag = {pointerId: event.pointerId, points: [point]};
        if (["conveyor","pit","erase"].includes(this.state.tool)) this.setState({drawing: [point.key]});
    }

    continueDraw(event) {
        if (!this.drag || this.drag.pointerId !== event.pointerId) return;
        if (!["conveyor","pit","erase"].includes(this.state.tool)) return;
        const point = this.point(event);
        if (!point || (this.isFixedStart(point) && this.state.tool !== "erase")) return;
        const points = this.drag.points;
        const last = points[points.length - 1];
        if (point.key === last.key) return;
        if (this.state.tool === "conveyor" && Math.abs(point.x-last.x)+Math.abs(point.y-last.y) !== 1) return;
        if (points.length > 1 && point.key === points[points.length - 2].key) points.pop();
        else if (!points.some((item) => item.key === point.key)) points.push(point);
        this.setState({drawing: points.map((item) => item.key)});
    }

    finishDraw(event) {
        if (!this.drag || this.drag.pointerId !== event.pointerId) return;
        const points = this.drag.points;
        this.drag = null;
        this.setState({drawing: []});
        if (!points.length) return;
        if (this.state.tool === "conveyor" && points.length > 1) {
            const existing = this.state.features;
            for (let index = 0; index < points.length - 1; index++) {
                const from = points[index], to = points[index+1];
                const direction = EDITOR_DIRECTIONS.find((candidate) => {
                    const [dx,dy] = FIELD_VECTORS[candidate];
                    return from.x+dx === to.x && from.y+dy === to.y;
                });
                if (!direction) {
                    this.setState({notice: "Ведите маршрут через соседние клетки."});
                    return;
                }
                if (existing.conveyors[from.key] && existing.conveyors[from.key] !== direction) {
                    this.setState({notice: "Через этот конвейер нельзя провести ленту поперёк его движения."});
                    return;
                }
                const boundary = physicalWallId(`${from.key},${direction}`);
                if (existing.walls.some((wall) => physicalWallId(wall) === boundary)) {
                    this.setState({notice: "Конвейер не может проходить сквозь стену."});
                    return;
                }
            }
        }
        if (this.state.tool === "pusher") {
            const point = points[0], facing = OPPOSITE_DIRECTION[point.side];
            const conflict = this.state.features.pushers.some((pusher) => pusher.x === point.x && pusher.y === point.y
                && pusher.direction !== facing
                && pusher.active.some((register) => this.state.pusherRegisters.includes(register)));
            if (conflict) {
                this.setState({notice: "Толкатели на одной клетке не могут срабатывать в одном регистре."});
                return;
            }
        }
        if (this.state.tool === "wall") {
            const point = points[0], wall = `${point.key},${point.side}`;
            const existed = this.state.features.walls.some((entry) => physicalWallId(entry) === physicalWallId(wall));
            if (!existed && wallBetweenPits(new Set(this.state.features.pits), wall)) {
                this.setState({notice: "Стена внутри ямы невозможна. Ставьте её только по внешнему краю."});
                return;
            }
        }
        if (this.state.tool === "conveyor" && points.length > 1) {
            const last = points[points.length-1], previous = points[points.length-2];
            const existing = this.state.features.conveyors[last.key];
            const incoming = EDITOR_DIRECTIONS.find((direction) => {
                const [dx,dy] = FIELD_VECTORS[direction];
                return previous.x + dx === last.x && previous.y + dy === last.y;
            });
            if (existing && existing === OPPOSITE_DIRECTION[incoming]) {
                this.setState({notice: "Здесь лента развернулась бы обратно. Измените точку слияния."});
                return;
            }
        }
        this.commit((current) => {
            const features = cloneEditableFeatures(current.features), flags = current.flags.map((flag) => [...flag]);
            const tool = current.tool;
            if (tool === "conveyor" || tool === "pit") {
                points.forEach((point, index) => {
                    if (tool === "conveyor" && points.length > 1
                        && features.conveyors[point.key]) return;
                    editorCellWithoutDevice(features, point.key);
                    if (tool === "pit") {
                        const flag = flags.findIndex(([x,y]) => `${x},${y}` === point.key);
                        if (flag >= 0) flags.splice(flag,1);
                        features.pits.push(point.key);
                        return;
                    }
                    const next = points[index + 1], previous = points[index - 1];
                    const neighbor = next || (previous ? {x: point.x * 2 - previous.x, y: point.y * 2 - previous.y} : null);
                    const direction = neighbor ? EDITOR_DIRECTIONS.find((candidate) => {
                        const [dx,dy] = FIELD_VECTORS[candidate];
                        return point.x + dx === neighbor.x && point.y + dy === neighbor.y;
                    }) : point.side;
                    features.conveyors[point.key] = direction || point.side;
                    if (current.express) features.express.push(point.key);
                });
                if (tool === "conveyor") points.slice(0,-1).forEach((point,index) => {
                    const connection = `${point.key}|${points[index+1].key}`;
                    if (!features.connections.includes(connection)) features.connections.push(connection);
                });
                if (tool === "pit") {
                    const pitCells = new Set(features.pits);
                    features.walls = features.walls.filter((wall) => !wallBetweenPits(pitCells, wall));
                }
            } else {
                const {x,y,key,side} = points[0];
                const facing = OPPOSITE_DIRECTION[side];
                if (tool === "flag") {
                    const index = flags.findIndex(([fx,fy]) => fx === x && fy === y);
                    if (index >= 0) flags.splice(index,1);
                    else if (flags.length < 8 && !features.pits.includes(key)) flags.push([x,y]);
                } else if (tool === "erase") {
                    if (points.length === 1) {
                        const boundary = physicalWallId(`${key},${side}`);
                        if (points[0].edgeDistance <= .18
                            && features.walls.some((wall) => physicalWallId(wall) === boundary))
                            editorRemoveWalls(features, new Set([boundary]));
                        else if (!this.isFixedStart(points[0])) {
                            editorCellWithoutDevice(features,key);
                            const index = flags.findIndex(([fx,fy]) => fx === x && fy === y);
                            if (index >= 0) flags.splice(index,1);
                        }
                    } else {
                        const boundaries = new Set();
                        points.forEach((point) => {
                            if (!this.isFixedStart(point)) editorCellWithoutDevice(features,point.key);
                            for (const boundary of this.editableCellBoundaries(point)) boundaries.add(boundary);
                            const index = this.isFixedStart(point) ? -1
                                : flags.findIndex(([fx,fy]) => fx === point.x && fy === point.y);
                            if (index >= 0) flags.splice(index,1);
                        });
                        editorRemoveWalls(features,boundaries);
                    }
                } else if (tool === "wall") {
                    const wall = `${key},${side}`, physical = physicalWallId(wall);
                    const existed = features.walls.some((entry) => physicalWallId(entry) === physical);
                    features.walls = features.walls.filter((entry) => physicalWallId(entry) !== physical);
                    if (!existed) {
                        features.walls.push(wall);
                        editorRemoveConnectionsAcrossWall(features, wall);
                    }
                } else if (tool === "repair" || tool === "gear") {
                    editorCellWithoutDevice(features,key);
                    if (tool === "repair") features.repairs.push(key);
                    else features.gears[key] = current.gearTurn;
                } else if (tool === "laser" || tool === "pusher") {
                    if (features.pits.includes(key)) return null;
                    const list = tool === "laser" ? features.lasers : features.pushers;
                    const existing = list.findIndex((item) => item.x === x && item.y === y && item.direction === facing);
                    if (existing >= 0) list.splice(existing,1);
                    list.push(tool === "laser" ? {x,y,direction:facing,count:current.laserCount}
                        : {x,y,direction:facing,active:[...current.pusherRegisters]});
                    const wall = `${key},${tool === "laser" ? OPPOSITE_DIRECTION[facing] : side}`;
                    if (!features.walls.some((entry) => physicalWallId(entry) === physicalWallId(wall))) features.walls.push(wall);
                    editorRemoveConnectionsAcrossWall(features, wall);
                }
            }
            return {features, flags, notice: ""};
        });
    }

    save() {
        if (!this.state.flags.length || this.state.flags.some(([x,y]) => this.state.features.pits.includes(`${x},${y}`)
            || this.isFixedStart({x,y}))) return;
        const payload = {name: this.state.name, sourceBoard: this.state.sourceBoard,
            start: this.state.start, editorRotation: this.state.rotation,
            features: this.state.features, flags: this.state.flags};
        if (new TextEncoder().encode(JSON.stringify(payload)).length > 9000) {
            this.setState({notice: "Поле слишком большое для отправки в комнату. Уберите часть элементов."});
            return;
        }
        this.props.app.socket.emit("set-authored-course", payload);
        this.props.onClose(null);
    }

    render() {
        const {state} = this.props;
        const {features, flags} = this.state;
        const viewAngle = this.props.app.boardViewAngle();
        return <div className="rr-editor-backdrop" onClick={(event) => event.target === event.currentTarget && this.close()}>
            <section className="rr-editor-modal" role="dialog" aria-modal="true" aria-labelledby="rr-editor-title" ref={this.dialogRef}>
                <header className="rr-editor-heading"><div><h2 id="rr-editor-title">Редактор поля</h2><p>Нарисуйте маршрут конвейера или выберите элемент и щёлкните по клетке.</p></div>
                    <button type="button" className="rr-editor-close" aria-label="Закрыть редактор" onClick={() => this.close()}>×</button></header>
                <div className="rr-editor-topbar">
                    <label>Основа <select aria-label="Основа поля" value={this.state.sourceBoard} onChange={(event) => this.changeBoard(event.target.value)}>
                        <option value="">Пустое поле</option>{Object.keys(state.boardTemplates || {}).map((board) => <option value={board} key={board}>Копия: {board}</option>)}
                    </select></label>
                    <label>Название <input aria-label="Название своего поля" maxLength="50" value={this.state.name} onChange={(event) => this.setState({name: event.target.value})}/></label>
                    <label>Старт <select aria-label="Старт своего поля" value={this.state.start} onChange={(event) => this.changeStart(event.target.value)}>
                        {state.startCards.map((start, index) => <option value={start} key={start}>Старт {index + 1}</option>)}
                    </select></label>
                    <div className="rr-editor-rotation" title="Поворачивает основу 12×12; стартовые ряды остаются на месте">
                        <button type="button" aria-label="Повернуть основу против часовой стрелки" onClick={() => this.rotateBoard(false)}>↺</button>
                        <span>Основа {this.state.rotation}°</span>
                        <button type="button" aria-label="Повернуть основу по часовой стрелке" onClick={() => this.rotateBoard(true)}>↻</button>
                    </div>
                    <BoardViewControls app={this.props.app}/>
                    <button type="button" disabled={!this.state.history.length} onClick={() => this.undo()}>↶ Отменить</button>
                    <button type="button" disabled={!this.state.future.length} onClick={() => this.redo()}>↷ Повторить</button>
                    <button type="button" className="rr-editor-clear" onClick={() => this.clearBoard()}
                        title="Вернуть пустую основу и исходную стартовую карту; можно отменить">Очистить</button>
                </div>
                <div className="rr-editor-workspace">
                    <div className="rr-editor-palette" aria-label="Инструменты редактора">
                        {EDITOR_TOOLS.map(([tool,label]) => <button type="button" key={tool} className={this.state.tool === tool ? "selected" : ""}
                            aria-label={label} title={label} aria-pressed={this.state.tool === tool} onClick={() => this.setState({tool})}>
                            <EditorToolIcon tool={tool} gearTurn={this.state.gearTurn} express={this.state.express}/>
                            <span className="rr-editor-tool-label">{label}</span>
                        </button>)}
                    </div>
                    <div className="rr-editor-board-column">
                        <div className={`rr-editor-board ${boardViewClass(viewAngle)}`} style={boardViewStyle(viewAngle)}
                            role="img" aria-label="Редактируемое поле 12 на 16 клеток"
                            onPointerDown={(event) => this.beginDraw(event)} onPointerMove={(event) => this.continueDraw(event)}
                            onPointerUp={(event) => this.finishDraw(event)} onPointerCancel={() => { this.drag = null; this.setState({drawing: []}); }}>
                            <div className="rr-view-canvas"><div className="rr-editor-factory"><CustomFactoryArt features={features}
                                starts={state.startTemplates?.[this.state.start]?.starts || []}/>
                                {flags.map(([x,y], index) => <FlagMarker key={`${x},${y}`} className="rr-editor-flag"
                                    number={index + 1} style={{left: `${(x+.5)/12*100}%`, top: `${(y+.5)/16*100}%`}}/>)}
                                {this.state.drawing.map((key) => {
                                    const [x,y] = keyPoint(key);
                                    return <i key={key} className="rr-editor-drawing" style={customCellStyle(x,y,16)}/>;
                                })}
                            </div></div>
                        </div>
                    </div>
                    <div className="rr-editor-inspector">
                        <h3>{EDITOR_TOOLS.find(([tool]) => tool === this.state.tool)?.[1] || "Инструмент"}</h3>
                        {this.state.tool === "conveyor" ? <React.Fragment><div className="rr-editor-edge-guide"><strong>Одна клетка: направление к выбранному краю</strong>
                            <span>Щёлкните ближе к краю, куда должна двигаться лента. Для маршрута проведите по соседним клеткам.</span></div>
                            <div className="rr-editor-variants" role="group" aria-label="Тип конвейера">
                                <button type="button" className={!this.state.express ? "selected" : ""} aria-pressed={!this.state.express}
                                    onClick={() => this.setState({express:false})}><EditorToolIcon tool="conveyor"/><span>Обычный</span></button>
                                <button type="button" className={this.state.express ? "selected" : ""} aria-pressed={this.state.express}
                                    onClick={() => this.setState({express:true})}><EditorToolIcon tool="conveyor" express/><span>Экспресс</span></button>
                            </div>
                            </React.Fragment> : null}
                        {this.state.tool === "laser" ? <React.Fragment><div className="rr-editor-edge-guide"><strong>Направление задаёт край клетки</strong>
                            <span>Щёлкните у нужного края: там появится стена, а луч пойдёт от неё внутрь. Правый край → влево.</span></div>
                            <label>Лучей <select value={this.state.laserCount} onChange={(event) => this.setState({laserCount:Number(event.target.value)})}>
                                {[1,2,3].map((count) => <option value={count} key={count}>{count}</option>)}</select></label></React.Fragment> : null}
                        {this.state.tool === "pusher" ? <div><p>Работает в регистрах:</p><div className="rr-editor-registers">{[1,2,3,4,5].map((register) =>
                            <button type="button" key={register} className={this.state.pusherRegisters.includes(register) ? "selected" : ""}
                                aria-pressed={this.state.pusherRegisters.includes(register)} onClick={() => this.setState((current) => ({pusherRegisters:
                                    current.pusherRegisters.includes(register) ? current.pusherRegisters.length > 1 ? current.pusherRegisters.filter((value) => value !== register) : current.pusherRegisters
                                        : [...current.pusherRegisters,register].sort()}))}>{register}</button>)}</div></div> : null}
                        {this.state.tool === "gear" ? <div className="rr-editor-variants" role="group" aria-label="Направление шестерни">
                            <button type="button" className={this.state.gearTurn === 1 ? "selected" : ""} aria-label="По часовой стрелке"
                                title="По часовой стрелке" aria-pressed={this.state.gearTurn === 1} onClick={() => this.setState({gearTurn:1})}>
                                <EditorToolIcon tool="gear"/><span>↻ По часовой</span></button>
                            <button type="button" className={this.state.gearTurn === -1 ? "selected" : ""} aria-label="Против часовой стрелки"
                                title="Против часовой стрелки" aria-pressed={this.state.gearTurn === -1} onClick={() => this.setState({gearTurn:-1})}>
                                <EditorToolIcon tool="gear" gearTurn={-1}/><span>↺ Против</span></button>
                        </div> : null}
                        {this.state.tool === "wall" ? <div className="rr-editor-edge-guide"><strong>Стена появится на выбранном краю</strong>
                            <span>Щёлкните ближе к нужной стороне клетки.</span></div> : null}
                        {this.state.tool === "pusher" ? <div className="rr-editor-edge-guide"><strong>Толкатель крепится к стене</strong>
                            <span>Щёлкните у края клетки: там появится стена, а толкатель будет двигать от неё внутрь клетки.</span></div> : null}
                        {this.state.tool === "erase" ? <div className="rr-editor-edge-guide"><strong>Клик или выделение</strong>
                            <span>Щёлкните по стене, чтобы удалить только её. Проведите по нескольким клеткам, чтобы очистить их целиком.</span></div> : null}
                        <div className="rr-editor-flags"><h3>Флаги · {flags.length}/8</h3>{flags.map(([x,y], index) => <div key={`${x},${y}`}>
                            <span>{index+1}. ({x+1}, {y+1})</span>
                            <button type="button" disabled={!index} aria-label={`Поднять флаг ${index+1}`} onClick={() => this.commit((current) => {
                                const next = current.flags.map((flag) => [...flag]); [next[index-1],next[index]]=[next[index],next[index-1]]; return {flags:next};
                            })}>↑</button>
                            <button type="button" aria-label={`Удалить флаг ${index+1}`} onClick={() => this.commit((current) => ({flags:current.flags.filter((_,position) => position !== index)}))}>×</button>
                        </div>)}</div>
                    </div>
                </div>
                <footer className="rr-editor-footer"><span role="status">{this.state.notice || (flags.length ? "Поле готово к выбору" : "Поставьте хотя бы один флаг")}</span>
                    <input ref={this.importRef} className="rr-editor-file-input" type="file" accept=".json,application/json"
                        aria-label="Файл поля для импорта" onChange={(event) => this.importField(event)}/>
                    <button type="button" onClick={() => this.importRef.current?.click()} title="Загрузить поле из JSON">Импорт JSON</button>
                    <button type="button" onClick={() => this.exportField()} title="Скачать поле в JSON">Экспорт JSON</button>
                    <button type="button" onClick={() => this.close()}>Закрыть</button>
                    <button type="button" className="primary" disabled={!flags.length || flags.some(([x,y]) => features.pits.includes(`${x},${y}`))}
                        onClick={() => this.save()}>Выбрать это поле</button></footer>
            </section>
        </div>;
    }
}

class CourseSetup extends React.Component {
    constructor(props) {
        super(props);
        this.state = {board: standardBoardName(props.state, props.state.course.board),
            start: props.state.course.start, rotation: props.state.course.rotation || 0,
            name: "Мой курс", flags: [[2,2], [9,5], [5,9]], flagHistory: [], inspectedCourseId: props.state.course.id,
            courseQuery: "", fitOnly: false, catalogOpen: true, editorOpen: false, editorDraft: null};
    }

    componentDidUpdate(previousProps) {
        if (previousProps.state.course.id !== this.props.state.course.id)
            this.setState({inspectedCourseId: this.props.state.course.id});
    }

    saveCustom() {
        this.props.app.socket.emit("set-custom-course", {name: this.state.name,
            board: standardBoardName(this.props.state, this.state.board), start: this.state.start,
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
        const viewAngle = app.boardViewAngle();
        const quickBoard = standardBoardName(state, this.state.board);
        const selected = state.course.id;
        const previewFlags = this.state.flags;
        const normalizedQuery = this.state.courseQuery.trim().toLocaleLowerCase("ru");
        const visibleCourses = state.courses.filter((course) => {
            const fits = playerCount >= course.min && playerCount <= course.max;
            const matches = !normalizedQuery || `${course.name} ${course.board} ${course.level}`.toLocaleLowerCase("ru").includes(normalizedQuery);
            return matches && (!this.state.fitOnly || fits);
        });
        const inspectedCourse = state.courses.find((course) => course.id === this.state.inspectedCourseId) || state.course;
        const inspectedIsSelected = inspectedCourse.id === selected;
        return <section className="course-setup rr-panel">
            <div className="selected-course-strip"><div><small>Выбран для игры</small><strong>{state.course.name}</strong>
                    <span>{state.course.board} · {state.course.players} игроков · {state.course.length}</span></div>
                <span className="selected-course-actions">
                    {readOnly && !inspectedIsSelected ? <button type="button" onClick={() => this.setState({inspectedCourseId: selected})}>Показать выбранный</button> : null}
                    {readOnly ? <em>Курс выбирает хост</em> : null}
                </span></div>
            <details className="lobby-fold course-browser" open={this.state.catalogOpen}
                onToggle={(event) => this.setState({catalogOpen: event.currentTarget.open})}>
                <summary><span>Готовые курсы <small>{state.courses.length}</small></span><em>{this.state.catalogOpen ? "Свернуть" : "Открыть каталог"}</em></summary>
                <div className="course-browser-tools">
                    <label className="course-search"><span>Поиск</span><input type="search" value={this.state.courseQuery} placeholder="Название, поле или сложность"
                        onChange={(event) => this.setState({courseQuery: event.target.value})}/></label>
                    <label className="course-fit-filter"><input type="checkbox" checked={this.state.fitOnly}
                        onChange={(event) => this.setState({fitOnly: event.target.checked})}/><span>Только для {playerCount} игроков</span></label>
                </div>
                <div className="course-browser-layout">
                    <div className="course-list" role="listbox" aria-label="Готовые курсы">{visibleCourses.map((course) => {
                        const fits = playerCount >= course.min && playerCount <= course.max;
                        return <button key={course.id} type="button" role="option" aria-selected={inspectedCourse.id === course.id}
                            className={`course-card ${selected === course.id ? "selected" : ""} ${inspectedCourse.id === course.id ? "inspected" : ""} ${fits ? "recommended" : ""}`}
                            onClick={() => {
                                this.setState({inspectedCourseId: course.id});
                                if (!readOnly && selected !== course.id) app.socket.emit("select-course", course.id);
                            }}>
                            <CourseThumbnail course={course} state={state} app={app}/>
                            <span className="course-card-copy"><strong>{course.name}</strong><span>{course.board} · {course.length}</span>
                                <small>{course.players} игроков · {course.level}</small>
                                <span className="course-card-badges">{selected === course.id ? <b className="course-selected-badge">Выбран</b> : null}
                                    <b className={`course-fit ${fits ? "fits" : "not-fit"}`}>{fits ? "Подходит" : course.players}</b>
                                    {course.specialRules ? <SpecialRuleMarker description={course.specialRules.description}/> : null}</span></span>
                        </button>;
                    })}{!visibleCourses.length ? <p className="course-empty">Курсы по этому фильтру не найдены.</p> : null}</div>
                    <section className="selected-course-preview" aria-live="polite">
                        <div className="selected-course-heading"><div><small>Просмотр курса</small><strong>{inspectedCourse.name}</strong>
                            <span>{inspectedCourse.board} · {inspectedCourse.players} игроков · {inspectedCourse.level}</span></div>
                            <BoardViewControls app={app}/></div>
                        <div className={`selected-course-body ${inspectedCourse.specialRules ? "has-special-rules" : ""}`}>
                            <div className="course-preview-group">
                                <div className={`large-course-preview ${boardViewClass(viewAngle)}`} style={boardViewStyle(viewAngle)}>
                                    <div className="rr-view-canvas"><CourseFieldContents course={inspectedCourse} state={state}
                                        flagClassName="large-preview-flag" showLobbyRobots={inspectedIsSelected}/></div></div>
                                {inspectedIsSelected ? <div className="course-start-controls">
                                    <div className="course-start-list" aria-label="Стартовые позиции">
                                        {state.playerSlots.filter(Boolean).map((userId) => <span className="course-start-chip" key={userId}
                                            title={`${playerName(state, userId)} · старт ${((state.startAssignments || {})[userId] ?? 0) + 1}`}>
                                            <i style={{background: (state.playerColors || {})[userId] || (state.robotColors || LOBBY_ROBOT_COLORS)[Math.max(0, state.playerSlots.indexOf(userId))]}}/>
                                            <b>{((state.startAssignments || {})[userId] ?? 0) + 1}</b>
                                            <span>{playerName(state, userId)}</span>
                                        </span>)}
                                        {!playerCount ? <span className="course-start-empty">Стартовые позиции появятся после присоединения игроков.</span> : null}
                                    </div>
                                    {!readOnly && playerCount > 1 ? <button type="button" onClick={() => app.socket.emit("shuffle-starts")}>Перемешать старты</button> : null}
                                </div> : null}
                            </div>
                            {inspectedCourse.specialRules ? <div className="selected-course-special-rules">
                                <strong>Special Rules</strong><p>{inspectedCourse.specialRules.description}</p>
                            </div> : null}
                        </div>
                        <div className="course-inspector-actions">
                            {inspectedIsSelected ? <strong className="course-current-note">✓ Выбран для игры</strong>
                                : readOnly ? <span>Можно осмотреть любой курс. Выбор изменяет хост.</span>
                                : <button type="button" className="primary" onClick={() => app.socket.emit("select-course", inspectedCourse.id)}>Выбрать этот курс</button>}
                        </div>
                    </section>
                </div>
            </details>
            {!readOnly ? <div className="rr-editor-launch"><div><strong>Своё поле</strong><small>Начните с пустого поля или измените готовое.</small></div>
                <button type="button" className="primary" onClick={(event) => { this.editorReturnFocus = event.currentTarget; this.setState({editorOpen:true}); }}>Открыть редактор поля</button></div> : null}
            {!readOnly ? <details className="constructor"><summary><span>Быстрый курс: готовое поле + флаги</span><em>Открыть</em></summary>
                <div className="constructor-fields">
                    <label>Название<input value={this.state.name} onChange={(event) => this.setState({name: event.target.value})}/></label>
                    <label>Карта<select value={quickBoard} onChange={(event) => this.setState({board: event.target.value})}>{Object.keys(state.boardCards).map((board) => <option key={board}>{board}</option>)}</select></label>
                    <label>Старт<select value={this.state.start} onChange={(event) => this.setState({start: event.target.value})}>{state.startCards.map((start) => <option value={start} key={start}>{start.replace(".jpg", "")}</option>)}</select></label>
                    <label>Поворот карты<select value={this.state.rotation} onChange={(event) => this.setState({rotation: Number(event.target.value)})}>
                        {[0,90,180,270].map((rotation) => <option value={rotation} key={rotation}>{rotation}°</option>)}</select></label>
                    <BoardViewControls app={app}/>
                </div>
                <div className={`constructor-preview ${boardViewClass(viewAngle)}`} style={boardViewStyle(viewAngle)}
                    onClick={(event) => {
                        const point = boardPointFromView(event.currentTarget, viewAngle, event.clientX, event.clientY);
                        if (point && point.fy < 12) this.toggleFlag(Math.floor(point.fx), Math.floor(point.fy));
                    }}><div className="rr-view-canvas"><img className="constructor-preview-board constructor-preview-factory" style={{transform: `rotate(${this.state.rotation}deg)`}}
                        src={boardImageUrl(state, quickBoard)}/>
                    <img className="constructor-preview-board constructor-preview-start"
                        src={startImageUrl(state, this.state.start)}/>
                    {previewFlags.map(([x, y], index) => <b className="preview-flag" key={`${x},${y},${index}`}
                        style={{left: `${(x + .5) / 12 * 100}%`, top: `${(y + .5) / 16 * 100}%`}}>{index + 1}</b>)}
                </div></div>
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
            {this.state.editorOpen ? <FieldEditorModal state={state} app={app} draft={this.state.editorDraft} returnFocus={this.editorReturnFocus}
                onClose={(draft) => this.setState({editorOpen:false, editorDraft:draft})}/> : null}
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
            const name = playerName(state, fill.userId);
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
    const pendingNames = (timer.userIds || [timer.userId]).map((userId) => playerName(state, userId)).join(", ");
    return <section className={`programming-timer ${timer.paused ? "paused" : remaining <= 10 ? "warning" : ""}`} role="timer" aria-live="polite">
        <span className="timer-clock" aria-hidden="true"><strong>{remaining}</strong><small>сек</small></span>
        <div><strong>{timer.paused ? "Таймер приостановлен" : timer.global ? "Особый таймер курса" : "Последний игрок программирует"}</strong>
            <small>{timer.paused ? "Отсчёт продолжится после снятия паузы." : `${pendingNames}: после сигнала пустые регистры заполнятся случайно.`}</small></div>
    </section>;
}

function bottomDockProgrammingState(state, isPlayer) {
    if (!isPlayer || state.phase !== "programming") return {className: "", label: null};
    if (state.programmingAutoFill) return {
        className: "rr-dock-programming rr-dock-expired",
        label: "ВРЕМЯ ВЫШЛО · РЕГИСТРЫ ЗАПОЛНЕНЫ"
    };
    const timer = state.programmingTimer;
    if (!timer) return state.paused ? {
        className: "rr-dock-programming rr-dock-paused",
        label: "ПРОГРАММИРОВАНИЕ НА ПАУЗЕ"
    } : {
        className: "rr-dock-programming",
        label: `ПРОГРАММИРОВАНИЕ · РАУНД ${state.round}`
    };
    const remaining = Math.max(0, Number(timer.remaining) || 0);
    if (timer.paused || state.paused) return {
        className: "rr-dock-programming rr-dock-timer rr-dock-paused",
        label: "ТАЙМЕР НА ПАУЗЕ"
    };
    const warning = remaining <= 10 ? " rr-dock-warning" : "";
    if (timer.global) return {
        className: `rr-dock-programming rr-dock-timer${warning}`,
        label: `ОСОБЫЙ ТАЙМЕР · ${remaining} СЕКУНД`
    };
    const targetIds = timer.userIds || [timer.userId];
    const isTarget = targetIds.includes(state.userId);
    return {
        className: `rr-dock-programming rr-dock-timer${warning}`,
        label: isTarget
            ? `ВАШИ ${remaining} СЕКУНД`
            : `${remaining} СЕКУНД · ${targetIds.map((userId) => playerName(state, userId)).join(", ")}`
    };
}

function Program({state, privateState, app}) {
    if (state.phase !== "programming" || !state.playerSlots.includes(state.userId)) return null;
    if (privateState.finished) return <section className="program rr-panel"><h2>Вы уже собрали все флаги</h2><p>Ваш робот завершил заезд. Остальные продолжают.</p></section>;
    if (privateState.lives === 0) return <section className="program rr-panel"><h2>Робот выбыл</h2><p>Хост может вернуть его в игру, выдав жизнь.</p></section>;
    if (privateState.poweredDown) return <section className="program power-down-active rr-panel">
        <PowerDownToken selected confirmed disabled title="Робот находится в Power Down"/>
        <div><h2>Power Down · раунд {state.round}</h2><p>Повреждения сняты. Робот не получает карты и не двигается самостоятельно, но поле продолжает на него воздействовать.</p></div>
    </section>;
    const selected = privateState.selected || [];
    const selectedCount = selected.filter(Boolean).length;
    const registerCards = privateState.registerCards || [];
    const lockedRegisters = privateState.lockedRegisters || [];
    const autoFilledRegisters = privateState.autoFilledRegisters || [];
    const simplePowerDown = state.activePowerDownMode === "simple";
    const interactionLocked = privateState.locked || state.paused || (simplePowerDown && privateState.powerDownIntent);
    const mayUnlock = privateState.locked && state.gameOptions?.lastPlayerSeconds === null && !state.programmingAutoFill && !state.programmingTimer;
    const drag = (event, payload) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/json", JSON.stringify(payload));
    };
    const drop = (event, register) => {
        event.preventDefault();
        event.stopPropagation();
        if (interactionLocked || lockedRegisters.includes(register)) return;
        try {
            const payload = JSON.parse(event.dataTransfer.getData("application/json"));
            if (payload.kind === "register") app.socket.emit("swap-registers", {from: payload.register, to: register});
            if (payload.kind === "card") app.socket.emit("assign-register", {cardId: payload.cardId, register});
        } catch (error) {}
    };
    const nearestRegister = (event) => {
        if (event.target.closest(".cards")) return null;
        const registers = [...event.currentTarget.querySelectorAll(".register")];
        const nearest = registers.map((element, register) => {
            const rect = element.getBoundingClientRect();
            const x = Math.max(rect.left, Math.min(event.clientX, rect.right));
            const y = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
            return {register, distance: Math.hypot(event.clientX - x, event.clientY - y)};
        }).sort((left, right) => left.distance - right.distance)[0];
        return nearest && nearest.distance <= 24 && !lockedRegisters.includes(nearest.register)
            ? nearest.register : null;
    };
    const allowDropNearRegister = (event) => {
        if (!interactionLocked && nearestRegister(event) !== null) event.preventDefault();
    };
    const dropNearRegister = (event) => {
        const register = nearestRegister(event);
        if (register !== null) drop(event, register);
    };
    return <section className="program rr-panel" onDragOver={allowDropNearRegister} onDrop={dropNearRegister}>
        <div className="program-heading">
            <div><h2>Программирование · раунд {state.round}</h2><p>Выберите ровно 5 карт. Их порядок — порядок регистров.</p></div>
            <div className="program-actions">
                <button onClick={() => app.socket.emit("auto-program")} disabled={interactionLocked}>Авто</button>
                <div className="power-down-action">
                    <PowerDownToken selected={!!privateState.powerDownIntent}
                        confirmed={!!privateState.locked && !!privateState.powerDownIntent}
                        urgent={privateState.damage >= 4} unavailable={!privateState.canPowerDown}
                        disabled={privateState.locked || state.paused || !privateState.canPowerDown}
                        title={!privateState.canPowerDown ? privateState.powerDownUnavailableReason || "Power Down недоступен"
                            : privateState.powerDownIntent ? "Отменить Power Down" : simplePowerDown ? "Power Down в этом раунде вместо программы" : "Power Down в следующем раунде"}
                        onClick={() => app.socket.emit("set-power-down-intent", {enabled: !privateState.powerDownIntent})}/>
                    <small>{!privateState.canPowerDown ? (privateState.powerDownUnavailableReason === "Курс запрещает Power Down" ? "Запрещён курсом" : "Нужен урон")
                        : privateState.locked && privateState.powerDownIntent ? "Объявлено"
                        : privateState.powerDownIntent ? "Выбрано" : simplePowerDown ? "Этот раунд" : "Следующий раунд"}</small>
                </div>
                <button className="primary" onClick={() => app.socket.emit(mayUnlock ? "unlock-program" : "lock-program")}
                    disabled={state.paused || (privateState.locked ? !mayUnlock : selectedCount !== 5 && !(simplePowerDown && privateState.powerDownIntent))}
                    title={mayUnlock ? "Отменить готовность и изменить выбор" : undefined}>{privateState.locked ? (mayUnlock ? "Отменить готовность" : "Готов ✓") : "Готов"}</button>
            </div>
        </div>
        <div className="registers">
            {[0, 1, 2, 3, 4].map((index) => {
                const card = registerCards[index] || privateState.hand.find((item) => item.id === selected[index]);
                return <div className={`register ${lockedRegisters.includes(index) ? "locked" : ""} ${autoFilledRegisters.includes(index) ? "auto-filled" : ""}`} key={index}
                    draggable={!!card && !lockedRegisters.includes(index) && !interactionLocked}
                    onDragStart={(event) => drag(event, {kind: "register", register: index})}
                    onDragOver={(event) => !interactionLocked && !lockedRegisters.includes(index) && event.preventDefault()}
                    onDrop={(event) => drop(event, index)}
                    onDoubleClick={() => app.socket.emit("clear-register", index)}>
                    <b>{index + 1}</b><span title={card ? card.label : undefined}>{card ? card.label : "—"}</span>
                    {card ? <small className="priority-badge" title="Приоритет карты">{card.priority}</small> : null}
                    {lockedRegisters.includes(index) ? <em>заблокирован</em> : null}
                </div>;
            })}
        </div>
        <div className="cards">
            {privateState.hand.map((card) => {
                const selectedIndex = selected.indexOf(card.id);
                return <button className={`card ${selectedIndex >= 0 ? "selected" : ""} ${autoFilledRegisters.includes(selectedIndex) ? "auto-filled-source" : ""}`} key={card.id}
                    disabled={interactionLocked}
                    draggable={!interactionLocked}
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
    return <section className="public-programs rr-panel"><h2>{resolving ? "Регистры роботов" : "Открытые заблокированные регистры"}</h2>
        {users.map((userId) => {
            const program = (state.programs && state.programs[userId]) || {cards: []};
            return <div className="public-program-row" key={userId}>
                <span className={userId === state.userId ? "own-player-name" : "player-name"}>{playerName(state, userId)}
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
    return <section className="power-down-choice-panel rr-panel">
        <div><h2>Продолжить Power Down?</h2><p>Ответили: {progress.answered} из {progress.total}. Решения откроются одновременно.</p></div>
        {choice.eligible ? <div className="power-down-choice-actions">
            <button type="button" className={choice.answered && choice.choice === false ? "selected" : ""}
                disabled={choice.answered || state.paused} onClick={() => app.socket.emit("choose-power-down-continuation", {enabled: false})}>Проснуться</button>
            <PowerDownToken selected={choice.answered && choice.choice === true}
                confirmed={choice.answered && choice.choice === true} disabled={choice.answered || state.paused}
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
        const activeName = playerName(state, state.reentryUserId);
        if (!reentry.active)
            return <section className="reentry-panel rr-panel"><h2>Возрождение</h2><p>Ожидаем, пока {activeName} выберет клетку и направление.</p></section>;
        const arrows = {north: "↑", east: "→", south: "↓", west: "←"};
        const modeChosen = !reentry.needsPowerDownChoice || this.state.poweredDown !== null;
        return <section className="reentry-panel rr-panel">
            <h2>Выберите возрождение</h2>
            <p>Сначала укажите режим, если он доступен, затем клетку и направление робота.</p>
            {reentry.needsPowerDownChoice ? <div className="reentry-power-down-choice">
                <button type="button" className={this.state.poweredDown === false ? "selected" : ""}
                    disabled={state.paused}
                    onClick={() => this.setState({poweredDown: false})}>Обычный режим</button>
                <PowerDownToken selected={this.state.poweredDown === true} title="Возродиться в Power Down"
                    disabled={state.paused}
                    onClick={() => this.setState({poweredDown: true})}/>
            </div> : null}
            <div className="reentry-options">{reentry.candidates.map((candidate, index) => <div className="reentry-option" key={`${candidate.x},${candidate.y}`}>
                <strong>{candidate.archive ? "Архив" : `Клетка ${index + 1}`}</strong>
                <span>{candidate.directions.map((direction) => <button className="direction-choice" key={direction} disabled={!modeChosen || state.paused}
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
        const storedView = localStorage.getItem(BOARD_VIEW_STORAGE_KEY);
        const boardViewChoice = ["0","90","180","270"].includes(storedView) ? Number(storedView) : null;
        const savedInfoDock = localStorage.getItem("roborally-info-dock");
        const savedProgramDock = localStorage.getItem("roborally-program-dock");
        const infoDock = DOCK_EDGES[savedInfoDock] ? savedInfoDock : "right";
        const programDock = DOCK_EDGES[savedProgramDock] && savedProgramDock !== infoDock ? savedProgramDock
            : infoDock === "bottom" ? "right" : "bottom";
        const boardHintsEnabled = localStorage.getItem("roborally-board-hints") !== "false";
        this.state = {inited: false, phase: "loading", playerNames: {}, playerSlots: [], robots: [], log: [], flags: [],
            boardViewportWidth: null, boardZoomSteps: 0, boardHintsEnabled,
            boardViewChoice, boardViewWindowWidth: window.innerWidth, infoDock, programDock,
            draggedDock: null, dockDropEdge: null,
            hudCollapsed: window.innerWidth < 1000, bottomDockCollapsed: false, guideOpen: false, conveyorGuideOpen: false, gameSettingsOpen: false,
            programmingCueActive: false, timerCueActive: false};
        this.privateState = {hand: [], selected: [], locked: false};
        this.openGuide = this.openGuide.bind(this);
        this.closeGuide = this.closeGuide.bind(this);
        this.openConveyorGuide = this.openConveyorGuide.bind(this);
        this.closeConveyorGuide = this.closeConveyorGuide.bind(this);
        this.openGameSettings = this.openGameSettings.bind(this);
        this.closeGameSettings = this.closeGameSettings.bind(this);
        this.setBottomDockRef = this.setBottomDockRef.bind(this);
        this.setInfoDockRef = this.setInfoDockRef.bind(this);
        this.setBoardColumnRef = this.setBoardColumnRef.bind(this);
        this.updateBoardViewWidth = this.updateBoardViewWidth.bind(this);
    }

    openGuide(event) {
        this.guideReturnFocus = event && event.currentTarget ? event.currentTarget : document.activeElement;
        this.setState({guideOpen: true});
    }

    closeGuide() {
        this.setState({guideOpen: false});
    }

    openConveyorGuide(event) {
        this.conveyorGuideReturnFocus = event && event.currentTarget ? event.currentTarget : document.activeElement;
        this.setState({conveyorGuideOpen: true});
    }

    closeConveyorGuide() {
        this.setState({conveyorGuideOpen: false});
    }

    openGameSettings(event) {
        this.settingsReturnFocus = event && event.currentTarget ? event.currentTarget : document.activeElement;
        this.setState({gameSettingsOpen: true});
    }

    closeGameSettings() {
        this.setState({gameSettingsOpen: false});
    }

    setBottomDockRef(element) {
        this.observeDock("program", element);
    }

    setInfoDockRef(element) {
        this.observeDock("info", element);
    }

    setBoardColumnRef(element) {
        if (this.boardColumnObserver) this.boardColumnObserver.disconnect();
        this.boardColumnElement = element;
        if (element) {
            this.boardColumnObserver = new ResizeObserver(() => this.scheduleBoardFit());
            this.boardColumnObserver.observe(element);
            this.scheduleBoardFit();
        }
    }

    scheduleBoardFit() {
        if (this.boardFitFrame) return;
        this.boardFitFrame = requestAnimationFrame(() => {
            this.boardFitFrame = null;
            const column = this.boardColumnElement;
            if (!column || !column.isConnected) return;
            const box = column.getBoundingClientRect();
            const root = column.closest(".roborally-app");
            const screen = column.closest(".game-screen");
            const reservedBelow = parseFloat(getComputedStyle(screen).paddingBottom)
                + parseFloat(getComputedStyle(root).paddingBottom) + 3;
            let bottom = window.innerHeight - reservedBelow;
            for (const [selector, panel] of [[".game-side-hud", "info"], [".bottom-dock", "program"]]) {
                if (root?.dataset[`${panel}Dock`] !== "bottom") continue;
                const dock = root.querySelector(selector);
                if (dock && getComputedStyle(dock).position === "fixed")
                    bottom = Math.min(bottom, dock.getBoundingClientRect().top - 12);
            }
            const aspect = this.boardViewAngle() % 180 ? 4 / 3 : 3 / 4;
            const availableWidth = Math.max(0, box.width);
            const availableHeight = Math.max(0, bottom - box.top - window.scrollY);
            const width = Math.round(Math.min(availableWidth, Math.max(Math.min(220, availableWidth), availableHeight * aspect)));
            if (Math.abs((this.state.boardViewportWidth || 0) - width) > 1)
                this.setState({boardViewportWidth: width});
        });
    }

    observeDock(panel, element) {
        const observerKey = `${panel}DockObserver`;
        if (this[observerKey]) this[observerKey].disconnect();
        this[observerKey] = null;
        if (!element) return;
        const updateReservedSpace = () => {
            element.closest(".game-screen")?.style.setProperty(
                `--rr-${panel}-reserved-space`, `${Math.ceil(element.getBoundingClientRect().height) + 16}px`);
            this.scheduleBoardFit();
        };
        updateReservedSpace();
        this[observerKey] = new ResizeObserver(updateReservedSpace);
        this[observerKey].observe(element);
    }

    setDockPosition(panel, position) {
        if (!DOCK_EDGES[position]) return;
        const selectedKey = `${panel}Dock`;
        const otherKey = panel === "info" ? "programDock" : "infoDock";
        const previous = this.state[selectedKey];
        const next = {[selectedKey]: position};
        if (this.state[otherKey] === position) next[otherKey] = previous;
        localStorage.setItem("roborally-info-dock", next.infoDock || this.state.infoDock);
        localStorage.setItem("roborally-program-dock", next.programDock || this.state.programDock);
        this.setState(next);
    }

    beginDockPointerDrag(panel, event) {
        if (event.button !== 0) return;
        const element = event.currentTarget.closest(panel === "info" ? ".game-side-hud" : ".bottom-dock");
        const box = element.getBoundingClientRect();
        this.dockPointerDrag = {panel, element, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
            offsetX: event.clientX - box.left, offsetY: event.clientY - box.top, width: box.width, height: box.height,
            originalStyle: element.getAttribute("style"), started: false};
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    moveDockPointerDrag(event) {
        const drag = this.dockPointerDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.started && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
        if (!drag.started) {
            drag.started = true;
            Object.assign(drag.element.style, {position: "fixed", right: "auto", bottom: "auto", width: `${drag.width}px`,
                height: `${drag.height}px`, maxHeight: "none", transform: "none", zIndex: "130"});
            this.setState({draggedDock: drag.panel, dockDropEdge: dockEdgeAt(event.clientX, event.clientY)});
        }
        drag.element.style.left = `${event.clientX - drag.offsetX}px`;
        drag.element.style.top = `${event.clientY - drag.offsetY}px`;
        const edge = dockEdgeAt(event.clientX, event.clientY);
        if (this.state.dockDropEdge !== edge) this.setState({dockDropEdge: edge});
    }

    endDockPointerDrag(event, cancelled = false) {
        const drag = this.dockPointerDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        this.dockPointerDrag = null;
        if (!drag.started) return;
        if (drag.originalStyle === null) drag.element.removeAttribute("style");
        else drag.element.setAttribute("style", drag.originalStyle);
        if (!cancelled) this.setDockPosition(drag.panel, dockEdgeAt(event.clientX, event.clientY));
        this.setState({draggedDock: null, dockDropEdge: null});
        this.scheduleBoardFit();
    }

    effectiveDockPositions(showProgramDock = true) {
        const {infoDock, programDock, boardViewWindowWidth} = this.state;
        const bothSide = showProgramDock && ["left", "right"].includes(infoDock) && ["left", "right"].includes(programDock);
        const compact = boardViewWindowWidth < 1000 || (bothSide && boardViewWindowWidth < 1200);
        if (!compact) return {info: infoDock, program: programDock, compact};
        const info = infoDock === "bottom" ? "bottom" : "top";
        let program = programDock === "top" ? "top" : "bottom";
        if (info === program) program = info === "top" ? "bottom" : "top";
        return {info, program, compact};
    }

    boardViewAngle() {
        return this.state.boardViewChoice === null
            ? (this.state.boardViewWindowWidth >= 1000 ? 90 : 0) : this.state.boardViewChoice;
    }

    rotateBoardView(delta) {
        const angle = (this.boardViewAngle() + delta + 360) % 360;
        localStorage.setItem(BOARD_VIEW_STORAGE_KEY, String(angle));
        this.setState({boardViewChoice: angle});
    }

    resetBoardViewAngle() {
        localStorage.removeItem(BOARD_VIEW_STORAGE_KEY);
        this.setState({boardViewChoice: null});
    }

    updateBoardViewWidth() {
        if (this.state.boardViewWindowWidth !== window.innerWidth)
            this.setState({boardViewWindowWidth: window.innerWidth,
                ...(this.state.boardViewWindowWidth >= 1000 && window.innerWidth < 1000 && !this.state.paused
                    ? {hudCollapsed: true} : this.state.boardViewWindowWidth < 1000 && window.innerWidth >= 1000
                    ? {hudCollapsed: false} : {})});
        this.scheduleBoardFit();
    }

    componentDidUpdate() {
        this.scheduleBoardFit();
    }

    componentDidMount() {
        window.addEventListener("resize", this.updateBoardViewWidth);
        const initArgs = CommonRoom.roomInit(this);
        this.socket.on("state", (state) => {
            CommonRoom.processCommonRoom(state, this.state, {
                maxPlayers: 8,
                largeImageKey: "roborally",
                details: "RoboRally"
            }, this);
            const isPlayer = (state.playerSlots || []).includes(this.userId);
            const isProgrammingPlayer = isPlayer && state.phase === "programming";
            const programmingCueKey = isProgrammingPlayer ? String(state.round) : null;
            const timerCueKey = isProgrammingPlayer && state.programmingTimer
                ? `${state.round}:${state.programmingTimer.global ? "global" : "last"}` : null;
            const localState = {};
            if (state.paused && !this.state.paused)
                localState.hudCollapsed = false;
            if (!programmingCueKey) {
                this.lastProgrammingCueKey = null;
                localState.programmingCueActive = false;
                clearTimeout(this.programmingCueTimeout);
            } else if (programmingCueKey !== this.lastProgrammingCueKey) {
                this.lastProgrammingCueKey = programmingCueKey;
                localState.programmingCueActive = true;
                clearTimeout(this.programmingCueTimeout);
                this.programmingCueTimeout = setTimeout(() => this.setState({programmingCueActive: false}), 1300);
            }
            if (!timerCueKey) {
                this.lastTimerCueKey = null;
                localState.timerCueActive = false;
                clearTimeout(this.timerCueTimeout);
            } else if (timerCueKey !== this.lastTimerCueKey) {
                this.lastTimerCueKey = timerCueKey;
                localState.timerCueActive = true;
                clearTimeout(this.timerCueTimeout);
                this.timerCueTimeout = setTimeout(() => this.setState({timerCueActive: false}), 1600);
            }
            if (isProgrammingPlayer) {
                const timer = state.programmingTimer;
                document.title = timer
                    ? (timer.paused || state.paused ? "Таймер на паузе · RoboRally" : `${Math.max(0, Number(timer.remaining) || 0)} сек · RoboRally`)
                    : "Программирование · RoboRally";
            } else document.title = "RoboRally";
            if (state.phase !== "lobby" && !state.paused) localState.gameSettingsOpen = false;
            if (state.phase === "lobby") {
                this.dockPointerDrag = null;
                localState.draggedDock = null;
                localState.dockDropEdge = null;
            }
            this.setState({...state, ...localState, userId: this.userId, inited: true});
        });
        this.socket.on("player-state", (playerState) => {
            this.privateState = playerState;
            this.forceUpdate();
        });
        this.socket.on("message", (message) => popup.alert({content: message}));
        this.socket.on("ping", (id) => this.socket.emit("pong", id));
        this.socket.emit("init", initArgs);
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateBoardViewWidth);
        clearTimeout(this.programmingCueTimeout);
        clearTimeout(this.timerCueTimeout);
        if (this.bottomDockObserver) this.bottomDockObserver.disconnect();
        if (this.infoDockObserver) this.infoDockObserver.disconnect();
        if (this.boardColumnObserver) this.boardColumnObserver.disconnect();
        if (this.boardFitFrame) cancelAnimationFrame(this.boardFitFrame);
        document.title = "RoboRally";
    }

    render() {
        const state = this.state;
        if (!state.inited) return <main className="loading">Подключение к цеху RoboRally…</main>;
        const isPlayer = state.playerSlots.includes(state.userId);
        const showBottomDock = (state.phase === "programming" && isPlayer) || state.phase === "power-down-choice" || state.phase === "reentry"
            || state.phase === "resolving" || state.phase === "finished";
        const dockProgramming = bottomDockProgrammingState(state, isPlayer);
        const dockCueClasses = `${state.programmingCueActive ? " rr-phase-cue-active" : ""}${state.timerCueActive ? " rr-timer-cue-active" : ""}`;
        const historyReview = state.historyReview || {actual: true, playing: false, revision: 0};
        const reviewingHistory = state.paused && !historyReview.actual;
        const replayKey = reviewingHistory ? `history-${historyReview.revision}` : "live";
        const viewAngle = this.boardViewAngle();
        const boardWidth = state.boardViewportWidth && Math.round(state.boardViewportWidth * Math.pow(1.15, state.boardZoomSteps));
        const dockPositions = this.effectiveDockPositions(showBottomDock);
        return <React.Fragment>
        <CommonRoom state={state} app={this}/>
        <HostControls app={this} data={state} timerControls={[]}
            emitEvent={(...args) => this.socket.emit(...args)}/>
        <main className={`roborally-app ${state.phase !== "lobby" ? "rr-playing" : ""} ${dockPositions.compact ? "rr-docks-compact" : ""}`}
            data-info-dock={dockPositions.info} data-program-dock={dockPositions.program}>
            <header>
                <div><h1>RoboRally</h1><p>Комната {state.roomId} · {state.phase === "programming" ? "программирование" : state.phase === "resolving" ? "исполнение" : state.phase === "power-down-choice" ? "решение Power Down" : state.phase === "reentry" ? "возрождение" : state.phase === "finished" ? "финиш" : "лобби"}</p></div>
                {state.userId === state.hostId && state.phase !== "lobby" ? <button onClick={() => this.socket.emit("restart-game")}>В лобби</button> : null}
            </header>
            {state.phase === "lobby" ? <Lobby state={state} app={this} onOpenGuide={this.openGuide} onOpenSettings={this.openGameSettings}/> : <div className={`game-screen ${state.paused ? "is-paused" : ""} ${reviewingHistory ? "is-history-review" : ""} ${historyReview.playing ? "is-history-playing" : ""}`}>
                {state.draggedDock ? <div className="rr-dock-drop-overlay" aria-hidden="true">
                    <div className={`rr-dock-snap-preview rr-dock-snap-${state.dockDropEdge} rr-dock-snap-${state.draggedDock}`}>
                        {DOCK_EDGES[state.dockDropEdge]}
                    </div>
                </div> : null}
                <PauseBanner state={state}/>
                <ProgrammingTimer state={state}/>
                <section className="game-layout">
                    <div className="board-column" ref={this.setBoardColumnRef}>
                        <div className={`board-viewport ${viewAngle % 180 ? "rr-view-landscape" : ""}`}
                            style={{width: boardWidth ? `${boardWidth}px` : "100%",
                                marginLeft: boardWidth ? `calc(50% - ${boardWidth / 2}px)` : undefined,
                                marginRight: 0}}>
                        <div className={`board-wrap ${boardViewClass(viewAngle)}`} style={{...boardViewStyle(viewAngle),
                            width: "100%"}}>
                            <div className="board rr-view-canvas" aria-label={`Игровое поле ${state.board.name}`}>
                            {state.course.customFeatures ? <div className={`factory-card ${state.course.customFeatures.fullField ? "rr-full-field" : ""}`}>
                                <CustomFactoryArt features={state.course.customFeatures}
                                    starts={(state.startTemplates?.[state.board.start]?.starts || [])}/></div>
                                : <img className="factory-card" draggable="false" style={{transform: `rotate(${state.course.rotation || 0}deg)`}}
                                    src={boardImageUrl(state, state.board.name)} />}
                            {!state.course.customFeatures?.fullField ? <img className="start-card" draggable="false" src={startImageUrl(state, state.board.start)} /> : null}
                            <div className="board-overlay" aria-hidden="true">
                                {state.flags.filter((flag) => flag.x != null && flag.y != null).map((flag) => <FlagMarker
                                    key={flag.number} number={flag.number} style={{left: `${(flag.x + .5) / 12 * 100}%`,
                                        top: `${(flag.y + .5) / 16 * 100}%`}}/>)}
                                {state.robots.filter((robot) => robot.archive && robot.archive.x != null && robot.archive.y != null && !robot.eliminated).map((robot) => <div className="archive-marker"
                                    key={`archive-${robot.userId}`} style={{left: `${robot.archive.x / 12 * 100 + .8}%`, top: `${robot.archive.y / 16 * 100 + .6}%`, background: robot.color}}
                                    title={`Архив: ${playerName(state, robot.userId)}`}>⚙</div>)}
                                {state.phase === "reentry" && this.privateState.reentry && this.privateState.reentry.active ? this.privateState.reentry.candidates.map((candidate, index) =>
                                    <div className="reentry-cell-marker" key={`reentry-${candidate.x}-${candidate.y}`}
                                        style={{gridColumn: `${candidate.x + 1} / ${candidate.x + 2}`, gridRow: `${candidate.y + 1} / ${candidate.y + 2}`}}>
                                        {candidate.archive ? "A" : index + 1}
                                    </div>) : null}
                                {state.robots.filter((robot) => robot.death).map((robot) => <RobotDeath key={`${replayKey}-${robot.userId}-${robot.death.id}`} robot={robot}/>)}
                                {state.robots.map((robot) => <Robot key={robot.userId} robot={robot} state={state} ownUserId={state.userId}/>)}
                                <BoardEvents events={state.boardEvents} replayKey={replayKey}/>
                                <LaserEffects shots={state.laserShots} robots={state.robots} replayKey={replayKey}/></div>
                            <BoardHints state={state} enabled={state.boardHintsEnabled}/>
                            </div>
                        </div>
                        </div>
                    </div>
                    <aside ref={this.setInfoDockRef} className={`game-side-hud ${state.hudCollapsed ? "collapsed" : ""} ${state.draggedDock === "info" ? "rr-dock-being-dragged" : ""}`}>
                        <div className="dock-title"><strong>
                            {state.hudCollapsed ? "Роботы и поле" : `Раунд ${state.round}`}</strong>
                            <button type="button" className="rr-dock-collapse-button" aria-expanded={!state.hudCollapsed}
                                aria-label={state.hudCollapsed ? "Показать информационную панель" : "Свернуть информационную панель"}
                                title={state.hudCollapsed ? "Показать панель" : "Свернуть панель"}
                                onClick={() => this.setState({hudCollapsed: !state.hudCollapsed})}>
                                {state.hudCollapsed ? "▴" : "▾"}</button>
                            <DockPlacementControl app={this} panel="info" effectivePosition={dockPositions.info}/></div>
                        <div className="dock-scroll">
                        <PlayerPanel state={state} app={this}/>
                        {state.course.specialRules ? <details className="rr-game-disclosure rr-course-rules"><summary>Особые правила · {state.course.name}</summary>
                            <CourseSpecialRules course={state.course}/>
                        </details> : null}
                        <QuickGuide onOpen={this.openGuide} onOpenConveyors={this.openConveyorGuide}/>
                        <details className="rr-game-disclosure rr-game-journal"><summary>Системный журнал</summary>
                            <section className="rr-panel log" aria-label="Системный журнал">{state.log.map((item, index) => <p key={index}>{item}</p>)}</section>
                        </details>
                        <HistoryReviewPanel state={state} app={this}/>
                        <GamePauseControls state={state} app={this}/>
                        </div>
                        <div className="rr-hud-footer">
                        <div className="board-toolbar rr-panel" aria-label="Управление видом поля">
                            <div className="rr-board-zoom-controls" role="group" aria-label="Размер поля">
                                <button type="button" aria-label="Уменьшить поле" title="Уменьшить поле"
                                    disabled={state.boardZoomSteps <= -6}
                                    onClick={() => this.setState({boardZoomSteps: Math.max(-6, state.boardZoomSteps - 1)})}>−</button>
                                <button type="button" aria-label="Автоматический размер поля" title="Автоматический размер поля"
                                    disabled={state.boardZoomSteps === 0}
                                    onClick={() => this.setState({boardZoomSteps: 0})}>⤢</button>
                                <button type="button" aria-label="Увеличить поле" title="Увеличить поле"
                                    disabled={state.boardZoomSteps >= 8}
                                    onClick={() => this.setState({boardZoomSteps: Math.min(8, state.boardZoomSteps + 1)})}>+</button>
                            </div>
                            <BoardViewControls app={this}/>
                            <button type="button" className={`board-hints-toggle ${state.boardHintsEnabled ? "active" : ""}`}
                                title="Включить или отключить подсказки элементов поля" aria-label="Подсказки элементов поля"
                                aria-pressed={state.boardHintsEnabled} onClick={() => {
                                    const enabled = !state.boardHintsEnabled;
                                    localStorage.setItem("roborally-board-hints", String(enabled));
                                    this.setState({boardHintsEnabled: enabled});
                                }}>?</button>
                        </div>
                        <section className="rr-panel stage" role="status"><h2>{state.phase === "resolving" ? `Регистр ${state.register} / 5` : "Сейчас"}</h2>
                            <p>{reviewingHistory ? `Журнал: ${state.stage}` : state.paused ? "Игра на паузе" : state.phase === "resolving" ? state.stage : state.phase === "programming" ? "Выбор программы" : state.phase === "reentry" ? "Возрождение роботов" : state.phase === "power-down-choice" ? "Решение Power Down" : "Заезд завершён"}</p></section>
                        </div>
                    </aside>
                </section>
                {showBottomDock ? <section ref={this.setBottomDockRef} className={`bottom-dock ${state.bottomDockCollapsed ? "collapsed" : ""} ${state.draggedDock === "program" ? "rr-dock-being-dragged" : ""} ${dockProgramming.className}${dockCueClasses}`}>
                    <div className="rr-program-dock-actions"><button className="bottom-dock-toggle rr-dock-collapse-button" type="button"
                        onClick={() => this.setState({bottomDockCollapsed: !state.bottomDockCollapsed})}
                        aria-label={state.bottomDockCollapsed ? "Показать панель программирования" : "Свернуть панель программирования"}
                        aria-expanded={!state.bottomDockCollapsed}
                        title={state.bottomDockCollapsed ? "Показать панель" : "Свернуть панель"}>
                        <span className="rr-dock-status-text" role="status" aria-live="polite">
                            {dockProgramming.label || (state.bottomDockCollapsed ? "Показать игровую панель" : "Свернуть")}
                        </span>
                        <span className="rr-dock-chevron" aria-hidden="true">{state.bottomDockCollapsed ? "▴" : "▾"}</span>
                    </button>
                    <DockPlacementControl app={this} panel="program" effectivePosition={dockPositions.program}/></div>
                    <div className="bottom-dock-scroll">
                        <Program state={state} privateState={this.privateState} app={this}/>
                        <PowerDownChoicePanel state={state} privateState={this.privateState} app={this}/>
                        <ReentryPanel state={state} privateState={this.privateState} app={this}/>
                        <PublicPrograms state={state}/>
                        {state.phase === "finished" ? <section className="winner rr-panel"><h2>Победитель: {playerName(state, state.winnerId)}</h2>
                            <p>{state.winnerReason === "last-robot-standing" ? "Все остальные роботы потеряли последние жизни." : "Все контрольные флаги активированы."}</p>
                        </section> : null}
                    </div>
                </section> : null}
            </div>}
            <GuideModal open={state.guideOpen} onClose={this.closeGuide} returnFocus={this.guideReturnFocus} options={state.gameOptions}/>
            <GameSettingsModal open={state.gameSettingsOpen} state={state} app={this} onClose={this.closeGameSettings} returnFocus={this.settingsReturnFocus}/>
            <ConveyorGuideModal open={state.conveyorGuideOpen} onClose={this.closeConveyorGuide} returnFocus={this.conveyorGuideReturnFocus}/>
        </main>
        </React.Fragment>;
    }
}

ReactDOM.render(<Game/>, document.getElementById("root"));
