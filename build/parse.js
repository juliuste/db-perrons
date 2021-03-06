'use strict'

const groupBy = require('lodash/groupBy')
const omit = require('lodash/omit')
const flatMap = require('lodash/flatMap')
const stations = require('db-stations/full')
const parseNumber = require('parse-decimal-number')
const germanNumberSymbols = require('cldr').extractNumberSymbols('de_DE')

// @todo fix this somehow
const knownMissingStationNumbers = [
	'558', // Berlin Schöneberg
	'7177', // Bürstadt
	'6245',
	'1950',
	'1376',
	'7790',
]

const brokenPlatformIds = [
	'8003059:41', // exists twice in the original dataset, with different perrons
	'8003483:1', // exists twice in the original dataset, with different perrons
	'8005030:1', // exists twice in the original dataset, with different perrons
	'8005163:2', // exists twice in the original dataset, with different perrons
]

// replace stationNumber with station
const improveStationMetadata = oldEntry => {
	const matchingStations = stations.filter(station => '' + station.nr === '' + oldEntry.stationNumber)
	if (matchingStations.length !== 1) throw new Error(`unknown station with stationNumber "${oldEntry.stationNumber}" in the original dataset`)
	return {
		station: matchingStations[0].id,
		...omit(oldEntry, ['stationNumber']),
	}
}

const createPerron = list => {
	const { perron, station, perronLength: length, perronHeight: height } = list[0]
	if (!list.every(item => item.station === station) || list.every(item => item.length === length) || list.every(item => item.length === length)) {
		throw new Error(`inconsistent data for perron "${perron}" at station "${station}" in the original dataset`)
	}

	return {
		id: [station, perron].join(':'),
		name: perron,
		station,
		length: parseNumber(length, germanNumberSymbols),
		height: parseNumber(height, germanNumberSymbols),
	}
}

const createTrack = perrons => rawTrack => {
	const { station, trackName: longName, track, perron: perronName } = rawTrack
	const perron = perrons.find(perron => perron.name === perronName && perron.station === station)

	const parsedName = longName.replace('Gleis ', '').trim()
	if (parsedName !== track.trim() && String(Number(parsedName)) !== parsedName) {
		console.error(`Mismatching track names: ${parsedName}, ${track} at ${station}, skipping`)
		return null
	}

	const id = [station, parsedName].join(':')
	if (brokenPlatformIds.includes(id)) {
		console.error(`Flagged as broken: ${id}, skipping`)
		return null
	}

	return {
		id,
		name: parsedName,
		longName,
		station,
		perron,
	}
}

const processStationPerronsAndTracks = list => {
	const byPerron = Object.values(groupBy(list, 'perron'))
	const perrons = byPerron.map(createPerron)
	const tracks = list.map(createTrack(perrons)).filter(Boolean)
	return tracks
}

const parse = data => {
	const withStationIds = data.filter(e => !knownMissingStationNumbers.includes(e.stationNumber)).map(improveStationMetadata)
	const byStation = Object.values(groupBy(withStationIds, 'station'))
	const tracks = flatMap(byStation, processStationPerronsAndTracks)
	return tracks
}

module.exports = parse
