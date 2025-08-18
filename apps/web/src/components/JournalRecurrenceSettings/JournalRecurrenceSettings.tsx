import './JournalRecurrenceSettings.scss';
import { DatePickerProps } from 'antd';
import { JournalDateField } from '../JournalForm/JournalForm';
import { Dayjs } from 'dayjs';
import { JournalRecurrenceFrequency, JournalStatus } from '../../shared/types/core';
import { toTitleCase } from '../../utils/utils';

interface JournalRecurrenceSettingsProps extends DatePickerProps {
  handleRecurringStartDateChange: (date: Dayjs, dateString: string | string[]) => void;
  handleRecurringEndDateChange: (date: Dayjs, dateString: string | string[]) => void;
  handleNeverExpiresChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  neverExpires: boolean;

  saveStatus: JournalStatus | string;
  handleRecurringSaveStatus: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function JournalRecurrenceSettings({
  handleRecurringStartDateChange,
  handleRecurringEndDateChange,
  handleNeverExpiresChange,
  neverExpires,
  saveStatus,
  handleRecurringSaveStatus,
}: JournalRecurrenceSettingsProps) {
  const recurrenceFrequency = Object.values(JournalRecurrenceFrequency);

  return (
    <div className="journal-recs">
      <div className="journal-recs-select">
        <div className="journal-recs-select__item journal-recs-select__date journal-recs-select__date-start">
          <JournalDateField
            onChange={handleRecurringStartDateChange}
            label="Start Date"
            defaultValue={null}
            required
          />
        </div>
        <div className="journal-recs-select__item journal-recs-select__date journal-recs-select__date-end">
          <JournalDateField
            onChange={handleRecurringEndDateChange}
            label="End Date"
            defaultValue={null}
          />
          <div className="journal-recs-select__date-neverexpires">
            <input
              type="checkbox"
              name=""
              id="neverExpires"
              checked={neverExpires}
              onChange={handleNeverExpiresChange}
              className="journal-recs-select__date-neverexpires--input"
            />
            <label htmlFor="neverExpires" className="journal-recs-select__date-neverexpires--label">
              Never Expires
            </label>
          </div>
        </div>
        <div className="journal-recs-select__freq">
          <label htmlFor="">Repeat</label>
          <select name="" id="" className="journal-recs-select__freq-box">
            {/* Not available in browsers yet
                <button>
                  <selectedcontent></selectedcontent>
                </button> */}
            <option value={''}></option>
            {recurrenceFrequency.map((item, index) => {
              return (
                <option key={index} className="journal-recs-select__freq-options" value={item}>
                  {toTitleCase(item)}
                </option>
              );
            })}
          </select>
        </div>
        <fieldset className="journal-form-ss__fieldset">
          <div className="journal-form-ss__div">
            <input
              type="radio"
              name="saveStatus"
              id="saveAsDraft"
              value={JournalStatus.DRAFT}
              checked={saveStatus === JournalStatus.DRAFT}
              onChange={handleRecurringSaveStatus}
              className="journal-form-ss__input"
            />
            <label htmlFor="saveAsDraft" className="journal-form-ss__label">
              Save as Draft
            </label>
          </div>

          <div className="journal-form-ss__div">
            <input
              type="radio"
              name="saveStatus"
              id="saveAsPosted"
              value={JournalStatus.POSTED}
              checked={saveStatus === JournalStatus.POSTED}
              onChange={handleRecurringSaveStatus}
              className="journal-form-ss__input"
            />
            <label htmlFor="saveAsPosted" className="journal-form-ss__label">
              Post
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
