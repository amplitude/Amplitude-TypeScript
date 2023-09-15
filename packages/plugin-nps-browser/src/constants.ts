export const DEFAULT_EVENT_PREFIX = '[Amplitude]';

export const DEFAULT_NPS_EVENT = `${DEFAULT_EVENT_PREFIX} NPS Score Submitted`;

export const html = `
<div style=" background: white;
position: fixed;
z-index: 10000;
bottom: 0;
width: 100%;
padding: 10px 50px;
border-top: 1px solid black;">
    <p>
    How likely is it that you would recommend Amplitude to a friend or
    colleague?
    </p>
    <ul
    style="
        display: flex;
        list-style-type: none;
        justify-content: space-between;
    "
    >
    <li style="cursor: pointer;">
        0
    </li>
    <li style="cursor: pointer;">
        1
    </li>
    <li style="cursor: pointer;">
        2
    </li>
    <li style="cursor: pointer;">
        3
    </li>
    <li style="cursor: pointer;">
        4
    </li>
    <li style="cursor: pointer;">
        5
    </li>
    <li style="cursor: pointer;">
        6
    </li>
    <li style="cursor: pointer;">
        7
    </li>

    <li>
        8
    </li>

    <li>
        9
    </li>

    <li>
        10
    </li>
    </ul>
</div>
`;
