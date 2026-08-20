import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import report from './modules/report.js';
import reportSetchannel from './modules/report_setchannel.js';

export default {
    name: 'report',
    description: 'Report a user to server staff, or configure where reports are sent.',
    category: 'Utility',
    async execute(message, args, config, client) {
        const subcommand = args[0]?.toLowerCase();

        if (!subcommand || subcommand === 'file') {
            const subArgs = subcommand === 'file' ? args.slice(1) : args;
            return await report.execute(message, subArgs, config, client);
        }

        if (subcommand === 'setchannel') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return message.reply('You need the Manage Server permission to use this command.');
            }
            const subArgs = args.slice(1);
            return await reportSetchannel.execute(message, subArgs, config, client);
        }

        return message.reply('Unknown subcommand. Use `?report file` or `?report setchannel`.');
    },
};
