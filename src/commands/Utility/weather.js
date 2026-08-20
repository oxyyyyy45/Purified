import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    name: "weather",
    description: "Get real-time weather information for a location",
    category: "Utility",

    async execute(message, args, config, client) {
        // Ensure arguments were provided
        if (!args || args.length === 0) {
            return message.reply("⚠️ Please provide a city name. Example: `?weather London` or `?weather New York`");
        }

        // Rejoin arguments to handle multi-word city names cleanly
        const citySearchQuery = args.join(" ");

        try {
            // 1. Fetch Geocoding Location Coordinates
            const geoResponse = await fetch(
                `${GEOCODING_URL}?name=${encodeURIComponent(citySearchQuery)}&count=1`
            );
            
            if (!geoResponse.ok) throw new Error(`Geocoding API responded with status ${geoResponse.status}`);
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                logger.info(`Weather prefix command - city not found`, {
                    userId: message.author.id,
                    city: citySearchQuery,
                    guildId: message.guildId
                });
                return message.reply(`❌ Could not find a location for **${citySearchQuery}**. Please check the spelling.`);
            }

            const { latitude, longitude, name: cityDisplay, country } = geoData.results[0];

            // 2. Fetch Weather Data (Explicitly request relative humidity as current variables)
            const weatherResponse = await fetch(
                `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
            );
            
            if (!weatherResponse.ok) throw new Error(`Weather API responded with status ${weatherResponse.status}`);
            const weatherData = await weatherResponse.json();

            if (weatherData.error) {
                throw new Error(weatherData.reason || "Unknown API error condition");
            }

            const current = weatherData.current || {};
            const temperature = current.temperature_2m != null ? Math.round(current.temperature_2m) : "N/A";
            const humidity = current.relative_humidity_2m ?? "N/A";
            const windSpeed = current.wind_speed_10m != null ? Math.round(current.wind_speed_10m) : "N/A";
            const weatherCode = current.weather_code ?? null;

            const condition = getWeatherDescription(weatherCode);

            // 3. Build and Dispatch Embed Solution
            const embed = createEmbed({ 
                title: `${condition.emoji} Weather in ${cityDisplay}, ${country}`, 
                description: `**Current Condition:** ${condition.description}` 
            })
            .addFields(
                { name: "🌡️ Temperature", value: `${temperature}°C`, inline: true },
                { name: "💧 Humidity", value: `${humidity}%`, inline: true },
                { name: "💨 Wind Speed", value: `${windSpeed} km/h`, inline: true },
            )
            .setFooter({
                text: `📍 Lat: ${latitude.toFixed(2)} | Lon: ${longitude.toFixed(2)}`,
            });

            await message.channel.send({ embeds: [embed] });

            logger.info(`Weather prefix command executed`, {
                userId: message.author.id,
                city: cityDisplay,
                country: country,
                temperature: temperature,
                guildId: message.guildId
            });

        } catch (error) {
            logger.error(`Weather prefix command failed`, {
                error: error.message,
                city: citySearchQuery,
                userId: message.author.id,
                guildId: message.guildId
            });
            return message.reply("⚠️ An unexpected error occurred while communicating with the weather services.");
        }
    },
};

/**
 * Maps WMO weather code sequences to clean description strings and visual emojis
 */
function getWeatherDescription(code) {
    if (code === null || code === undefined) return { description: "Unknown conditions.", emoji: "❓" };
    if (code === 0) return { description: "Clear Sky", emoji: "☀️" };
    if (code >= 1 && code <= 3) return { description: "Mainly Clear / Partly Cloudy", emoji: "⛅" };
    if (code === 45 || code === 48) return { description: "Fog and Depositing Rime Fog", emoji: "🌫️" };
    if (code >= 51 && code <= 55) return { description: "Drizzle (Light to Dense)", emoji: "🌧️" };
    if (code >= 56 && code <= 57) return { description: "Freezing Drizzle", emoji: "🥶" };
    if (code >= 61 && code <= 65) return { description: "Rain (Slight to Heavy)", emoji: "🌧️" };
    if (code >= 66 && code <= 67) return { description: "Freezing Rain", emoji: "🧊" };
    if (code >= 71 && code <= 75) return { description: "Snow Fall (Slight to Heavy)", emoji: "❄️" };
    if (code === 77) return { description: "Snow Grains", emoji: "❄️" };
    if (code >= 80 && code <= 82) return { description: "Rain Showers", emoji: "🌦️" };
    if (code >= 85 && code <= 86) return { description: "Snow Showers", emoji: "🌨️" };
    if (code === 95) return { description: "Thunderstorm", emoji: "⛈️" };
    if (code >= 96 && code <= 99) return { description: "Thunderstorm with Hail", emoji: "⛈️" };
    
    return { description: "Unknown conditions.", emoji: "❓" };
}
