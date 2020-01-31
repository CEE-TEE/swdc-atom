'use babel';

import $ from 'jquery';
import fs from 'fs';
import path from 'path';
import SessionSummary from '../model/SessionSummary';

const sessionSummaryDataMgr = require('../storage/SessionSummaryDataManager');
const wallClockMgr = require('../managers/WallClockManager');
const utilMgr = require('../UtilManager');
const eventMgr = require('../managers/EventManager');
const gitUtil = require('../repo/GitUtil');
const numeral = require('numeral');
const moment = require('moment-timezone');

let checkedMap = {
    'editor-time': true,
    'code-time': true,
};

export default class CodeTimeProvider {
    constructor() {
        this.currentKeystrokeStats = new SessionSummary();
        const htmlString = fs.readFileSync(
            path.join(__dirname, '../..', 'templates', 'structure-view.html'),
            {
                encoding: 'utf-8',
            }
        );
        this.element = $(htmlString).get(0);
        this.viewType = 'codetimeProvider';
    }
    showLoader() {
        $('#tree-content').hide();
        $('#loader').show();
    }

    hideLoader() {
        $('#tree-content').show();
        $('#loader').hide();
    }

    initialize() {
        this.showLoader();
        this.renderTree();
    }

    toggleDeviceStatus(isHide) {
        if (isHide) {
            $('#spotify-player-device').hide();
        } else {
            $('#spotify-player-device').show();
        }
    }

    toggleRefreshTreeview(isHide) {
        if (isHide) {
            $('#refresh-treeview').hide();
        } else {
            $('#refresh-treeview').show();
        }
    }

    renderTree() {
        let html = this.treeGenerator();
        $('div.structure-view>div>ol').html(html);
        this.hideLoader();
    }

    clearTree() {
        $('div.structure-view>div>ol').html('');
    }

    async treeGenerator() {
        if (utilMgr.showingStatusBarText()) {
            $('#toggle-status-metrics').html('Hide status bar metrics');
        } else {
            $('#toggle-status-metrics').html('Show status bar metrics');
        }

        const data = sessionSummaryDataMgr.getSessionSummaryData();
        const metricNodesHtml = this.buildMetricsNodes(data);

        const projectMetricNodesHtml = await this.buildCommitTreeNodes();

        // console.log('nodes html: ', metricNodesHtml);
        $('#code-time-metrics').html(metricNodesHtml);
        $('#code-project-metrics').html(projectMetricNodesHtml);
    }

    setCurrentKeystrokeStats(keystrokeStats) {
        if (!keystrokeStats) {
            this.currentKeystrokeStats = new SessionSummary();
        } else {
            // update the current stats
            Object.keys(keystrokeStats.source).forEach(key => {
                const fileInfo: FileChangeInfo = keystrokeStats.source[key];
                this.currentKeystrokeStats.currentDayKeystrokes =
                    fileInfo.keystrokes;
                this.currentKeystrokeStats.currentDayLinesAdded =
                    fileInfo.linesAdded;
                this.currentKeystrokeStats.currentDayLinesRemoved =
                    fileInfo.linesRemoved;
            });
        }
    }

    buildMetricsNodes(data) {
        const liItems = [];

        // EDITOR-TIME metric
        const editorMinutes = wallClockMgr.getHumanizedWcTime();
        liItems.push(
            this.buildCodeTimeMetricsLiItem(
                'editor-time',
                'Editor time',
                editorMinutes
            )
        );

        // CODE-TIME node
        const codeTimeMinutes = utilMgr.humanizeMinutes(data.currentDayMinutes);
        const avgDailyMinutes = utilMgr.humanizeMinutes(
            data.averageDailyMinutes
        );
        const globalAvgMinutes = utilMgr.humanizeMinutes(
            data.globalAverageSeconds / 60
        );
        let boltIcon =
            data.currentDayMinutes > data.averageDailyMinutes
                ? 'bolt-icon'
                : 'bolt-grey-icon';
        liItems.push(
            this.buildCodeTimeMetricsLiItem(
                'code-time',
                'Code time',
                codeTimeMinutes,
                avgDailyMinutes,
                globalAvgMinutes,
                boltIcon
            )
        );

        const currLinesAdded =
            this.currentKeystrokeStats.currentDayLinesAdded +
            data.currentDayLinesAdded;
        const linesAdded = numeral(currLinesAdded).format('0 a');
        const avgLinesAdded = numeral(data.averageLinesAdded).format('0 a');
        const globalLinesAdded = numeral(data.globalAverageLinesAdded).format(
            '0 a'
        );
        boltIcon =
            data.currentDayLinesAdded > data.averageLinesAdded
                ? 'bolt-icon'
                : 'bolt-grey-icon';
        liItems.push(
            this.buildCodeTimeMetricsLiItem(
                'lines-added',
                'Lines added',
                linesAdded,
                avgLinesAdded,
                globalLinesAdded,
                boltIcon
            )
        );

        const currLinesRemoved =
            this.currentKeystrokeStats.currentDayLinesRemoved +
            data.currentDayLinesRemoved;
        const linesRemoved = numeral(currLinesRemoved).format('0 a');
        const avgLinesRemoved = numeral(data.averageLinesRemoved).format('0 a');
        const globalLinesRemoved = numeral(
            data.globalAverageLinesRemoved
        ).format('0 a');
        boltIcon =
            data.currentDayLinesRemoved > data.averageLinesRemoved
                ? 'bolt-icon'
                : 'bolt-grey-icon';
        liItems.push(
            this.buildCodeTimeMetricsLiItem(
                'lines-removed',
                'Lines removed',
                linesRemoved,
                avgLinesRemoved,
                globalLinesRemoved,
                boltIcon
            )
        );

        const currKeystrokes =
            this.currentKeystrokeStats.currentDayKeystrokes +
            data.currentDayKeystrokes;
        const keystrokes = numeral(currKeystrokes).format('0 a');
        const avgKeystrokes = numeral(data.averageDailyKeystrokes).format(
            '0 a'
        );
        const globalKeystrokes = numeral(
            data.globalAverageDailyKeystrokes
        ).format('0 a');
        boltIcon =
            data.currentDayKeystrokes > data.averageDailyKeystrokes
                ? 'bolt-icon'
                : 'bolt-grey-icon';
        liItems.push(
            this.buildCodeTimeMetricsLiItem(
                'keystrokes',
                'Keystrokes',
                keystrokes,
                avgKeystrokes,
                globalKeystrokes,
                boltIcon
            )
        );

        // build the editor time li
        return `<ul>${liItems.join('\n')}</ul>`;
    }

    async buildCommitTreeNodes() {
        const commitTreeNodes = [];

        const folders = utilMgr.getOpenProjects();
        if (folders && folders.length > 0) {
            const openChangesDirNodes = [];
            const committedChangesDirNodes = [];
            for (let i = 0; i < folders.length; i++) {
                const dir = folders[i];
                // get uncommitted change info
                const currentChagesSummary = await gitUtil.getUncommitedChanges(
                    dir
                );
                const basename = path.basename(dir);
                const openChangesNodeHtml = this.buildOpenChangesDirNodeItem(
                    `uncommitted-${i}`,
                    basename,
                    currentChagesSummary.insertions,
                    currentChagesSummary.deletions
                );
                openChangesDirNodes.push(openChangesNodeHtml);

                // get the completed commits of today
                const todaysChagesSummary = await gitUtil.getTodaysCommits(dir);

                const committedChangesNodeHtml = this.buildOpenChangesDirNodeItem(
                    `commited-${i}`,
                    basename,
                    todaysChagesSummary.insertions,
                    todaysChagesSummary.deletions,
                    todaysChagesSummary.commitCount,
                    todaysChagesSummary.fileCount
                );
                committedChangesDirNodes.push(committedChangesNodeHtml);
            }
            const openChangesNodeHtml = this.buildProjectMetricNodeItem(
                'open-changes',
                'Open changes',
                openChangesDirNodes
            );
            const committedChangesNodeHtml = this.buildProjectMetricNodeItem(
                'commited-changes',
                'Committed today',
                committedChangesDirNodes
            );
            commitTreeNodes.push(openChangesNodeHtml);
            commitTreeNodes.push(committedChangesNodeHtml);
        }

        // build the editor time li
        return `${commitTreeNodes.join('\n')}`;
    }

    buildCodeTimeMetricsLiItem(
        id,
        label,
        todayValue,
        avgValue = null,
        globalAvgValue = null,
        boltIcon = null
    ) {
        const checkedProp = this.getCheckedPropertyForId(id);
        if (avgValue && globalAvgValue) {
            boltIcon = boltIcon ? boltIcon : 'bolt-grey';
            return `
                <li>
                    <input type="checkbox" id="${id}" value="${label}"${checkedProp}/>
                    <label for="${id}">${label}</label>
                    <ul>
                        <li><a href="#" id="${id}-today" class="rocket-icon">Today: ${todayValue}</a></li>
                        <li>
                            <a href="#" id="${id}-avg" class="${boltIcon}">Your average: ${avgValue}</a>
                        </li>
                        <li>
                            <a href="#" id="${id}-global" class="global-grey-icon">Global average: ${globalAvgValue}</a>
                        </li>
                    </ul>
                </li>`;
        }

        return `
            <li>
                <input type="checkbox" id="${id}" value="${label}"${checkedProp}/>
                <label for="${id}">${label}</label>
                <ul>
                    <li><a href="#" id="${id}-today" class="rocket-icon">Today: ${todayValue}</a></li>
                </ul>
            </li>`;
    }

    buildOpenChangesDirNodeItem(
        id,
        label,
        insertions,
        deletions,
        commitCount = null,
        fileCount = null
    ) {
        const checkedProp = this.getCheckedPropertyForId(id);
        if (commitCount === null) {
            return `
                <li>
                    <input type="checkbox" id="${id}" value="${label}"${checkedProp}/>
                    <label for="${id}">${label}</label>
                    <ul>
                        <li><a href="#" id="${id}-insertions" class="insertion-icon">Insertion(s): ${insertions}</a></li>
                        <li>
                            <a href="#" id="${id}-deletions" class="deletion-icon">Deletion(s): ${deletions}</a>
                        </li>
                    </ul>
                </li>`;
        } else {
            return `
                    <li>
                        <input type="checkbox" id="${id}" value="${label}"${checkedProp}/>
                        <label for="${id}">${label}</label>
                        <ul>
                            <li><a href="#" id="${id}-insertions" class="insertion-icon">Insertion(s): ${insertions}</a></li>
                            <li>
                                <a href="#" id="${id}-deletions" class="deletion-icon">Deletion(s): ${deletions}</a>
                            </li>
                            <li><a href="#" id="${id}-commit-count" class="commit-icon">Commit(s): ${commitCount}</a></li>
                            <li>
                                <a href="#" id="${id}-file-count" class="files-icon">Files changed: ${fileCount}</a>
                            </li>
                        </ul>
                    </li>`;
        }
    }

    buildProjectMetricNodeItem(id, label, nodes) {
        const checkedProp = this.getCheckedPropertyForId(id);
        return `
        <ul>
            <li>
                <input type="checkbox" id="${id}" value="${label}"${checkedProp}/>
                <label for="${id}">${label}</label>
                <ul>
                    ${nodes.join('\n')}
                </ul>
            </li>
        </ul>`;
    }

    getCheckedPropertyForId(id) {
        if (checkedMap[id]) {
            return checkedMap[id] === true ? ' checked' : '';
        }
        return '';
    }

    serialize() {}

    destroy() {
        this.element.remove();
    }

    getElement() {
        return this.element;
    }

    getTitle() {
        return 'Code Time';
    }
}

$(document).on('click', '#advanced-metrics', async () => {
    atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        'Code-Time:web-dashboard'
    );
});

$(document).on('click', '#generate-dashboard', async () => {
    atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        'Code-Time:dashboard'
    );
});

$(document).on('click', '#toggle-status-metrics', async () => {
    atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        'Code-Time:toggle-status-bar-metrics'
    );
});

$(document).on('click', '#submit-feedback', async () => {
    atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        'Code-Time:submit-feedback'
    );
});

$(document).on('click', '#learn-more', async () => {
    atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        'Code-Time:learn-more'
    );
});

$(document).on('click', 'input[type=checkbox]', async el => {
    if (!el.currentTarget) {
        return;
    }

    const checked =
        el.currentTarget.checked !== null &&
        el.currentTarget.checked !== undefined
            ? el.currentTarget.checked
            : false;
    if (checked) {
        // create the code time event
        let label = el.currentTarget.value;
        label = label ? label.replace(/\s/g, '') : label;
        eventMgr.createCodeTimeEvent(
            'mouse',
            'click',
            `TreeViewItemExpand_${label}`
        );
    }
    checkedMap[el.currentTarget.id] = checked;
});