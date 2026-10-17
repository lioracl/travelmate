'use strict';

function isValidTripDay(day, tripLength) {
  return Number.isInteger(day) && Number.isInteger(tripLength)
    && day > 0 && tripLength > 0 && day <= tripLength;
}

module.exports = { isValidTripDay };
