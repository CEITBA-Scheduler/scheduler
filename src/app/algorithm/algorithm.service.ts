'use strict';
import {Injectable} from '@angular/core';
import {
  ICombination,
  ICommission,
  IPriority,
  ISubject,
  ITimeblock,
  ISubjectSelection,
  PriorityTypes,
  Transform,
  VerifierFunction
} from './algorithm-interface';
import {
  Combination,
  CombinationSubject,
  Priority
} from './algorithm-object';

@Injectable({
  providedIn: 'root'
})
export class AlgorithmService {

  constructor() { }

  /**
   * Recursive algorithm to generate a list of all possible combinations between subjects.
   * @param subjects      List of selected subjects
   * @param verifier      Callable function to determine whether it should be included or not
   * @param combination   Combination being generated by the current tree path
   * @returns All possible combinations of commissions of subjects
   */
  private searchCombinations(subjects: ISubject[], verifier: VerifierFunction, combination: ICombination = null)
  : Combination[] {
    // When the function is first called, no combination has been generated, so
    // I need to create a default instance of this object
    if (combination === null) {
        combination = new Combination();
    }

    // Checking if we still have more subjects to continue with the tree of
    // possible combinations
    if (subjects.length > 0) {
        // Pops a subject from the list of subjects and iterates over all possible
        // commissions creating for each a new possible combination on the tree
        let combinations: Combination[] = [];
        const nodeSubject: ISubject = subjects.pop();
        const nodeCommissions: ICommission[] = nodeSubject.commissions;

        for (const nodeCommission of nodeCommissions) {
            const newCombination = JSON.parse(JSON.stringify(combination));
            const newSubject = new CombinationSubject(
              nodeSubject.name,
              nodeSubject.code,
              nodeCommission.hasOwnProperty('teachers') ? nodeCommission.professors : undefined,
              nodeCommission.label,
              nodeCommission.schedule
            );
            newCombination.subjects.push(newSubject);

            // Get the new possible combinations for each commission case and concatenates them
            // with the current result of combinations
            const recursiveCombinations = this.searchCombinations(subjects.slice(), verifier, newCombination);
            combinations = combinations.concat(recursiveCombinations);
        }

        // Returns the possible combinations
        return combinations;
    } else {
        // When there are not subjects left, we have to check if the current combination created
        // is valid according to the criteria or priorities taken by the algorithm user...
        return verifier(combination) ? [combination] : [];
    }
  }

  /**
   * Calculates the corresponding weight for a combination with the given priorities according
   * to the user's priority and subject selection.
   * @param combination       Combination being tested
   * @param priorities        Priorities being selected by the user
   * @param selectedSubjects  Subjects selected
   * @param transform         Transform function used for the weight algorithm
   */
  private computeWeight(combination: ICombination, priorities: IPriority[], selectedSubjects: ISubjectSelection[], transform: Transform)
  : void {
    combination.weight = this.weightAlgorithm(priorities, combination.priorities, selectedSubjects, transform);
  }

  /**
   * Algorithm that calculates the corresponding weight of each combination according to the user specifications.
   * @param priorities              List of priorities set by the user
   * @param combinationPriorities   List of priorities used by the current combination
   * @param subjects                List of subjects
   * @param transform               Callable function to transform values
   */
  private weightAlgorithm(priorities: IPriority[], combinationPriorities: number[], subjects: ISubjectSelection[], transform: Transform)
  : number {
    // 1°, calculate the base value for each priority amount
    const base = priorities.length * transform(priorities.length) * transform(subjects.length);

    // 2°, calculate the starting value for the amount of priorities of the combination
    const weight = base * combinationPriorities.length;

    // 3°, calculate the indexed value inside the range for the given amount of priorities
    let indexedWeight = 0;
    for (const index of combinationPriorities) {
        const currentPriority: IPriority = priorities[index];
        if (currentPriority.hasSubjectRelated()) {
          const currentSubject = subjects.find(subject => subject.code === currentPriority.relatedSubjectCode);
          indexedWeight += (transform(currentPriority.weight) * transform(currentSubject.weight));
        } else {
          indexedWeight += transform(currentPriority.weight);
        }

    }

    // 4°, return the resulting value
    return weight + indexedWeight;
  }

  /**
   * Returns a boolean, determining whether it should be included or not the combination.
   * @param combination Combination to be verified
   * @param priorities  List of priorities and criteria set by the user
   */
  private verifiesPriorities(combination: ICombination, priorities: IPriority[]): boolean {
    for (let index = 0 ; index < priorities.length ; index++) {
      const currentPriority = priorities[index];

      switch (currentPriority.type) {
        // First verification is by superposition.
        // This is usually an exclusive condition.
        case PriorityTypes.SUPERPOSITION:
          for (let i = 0; i < combination.subjects.length; i++) {
            for (let j = i + 1; j < combination.subjects.length; j++) {
              for (const firstTimeblock of combination.subjects[i].commissionTimes) {
                for (const secondTimeblock of combination.subjects[j].commissionTimes) {
                  if (firstTimeblock.overlaps(secondTimeblock) > currentPriority.value) {
                    if (currentPriority.isExclusive()) {
                      return false;
                    }
                  }
                }
              }
            }
          }
          combination.priorities.push(Number(index));
          break;

        case PriorityTypes.COMMISSION:
          const prioritySubject = combination.subjects.find(subject => subject.code === currentPriority.relatedSubjectCode);
          if (prioritySubject) {
            if (prioritySubject.commissionName === currentPriority.value) {
              combination.priorities.push(Number(index));
            } else if (currentPriority.isExclusive()) {
              return false;
            }
          } else if (currentPriority.isExclusive()) {
            return false;
          }
          break;

        case PriorityTypes.PROFESSOR:
          let hasPriorityTeacher = false; // We assume there is no prioritized teacher to begin
          const professorSubject = combination.subjects.find(subject => subject.code === currentPriority.relatedSubjectCode);
          if (professorSubject && professorSubject.hasProfessors()) {
            for (const currentTeacher of professorSubject.professors) {
              if (currentTeacher === currentPriority.value) {
                combination.priorities.push(Number(index));
                hasPriorityTeacher = true;
                break;
              }
            }
          } else if (currentPriority.isExclusive()) {
            return false;
          }

          if (currentPriority.isExclusive() && !hasPriorityTeacher) {
            return false;
          } // Exclusive condition failed verify
          break;

        case PriorityTypes.FREEDAY:
          let isFreeDay = true; // All days are freeDays until proven otherwise
          for (const currentCommission of combination.subjects) {
            for (const currentTime of currentCommission.commissionTimes) {
              if (currentTime.day === currentPriority.value) {
                isFreeDay = false; // If we find a schedule on our freeday it is NOT a priority
                break;
              }
            }
            if (!isFreeDay) {
              if (currentPriority.isExclusive()) {return false; } // Exclusive condition failed verify
              break; } // This line is to optimize code. Not entirely necessary
          }
          if (isFreeDay) {
            combination.priorities.push(Number(index));
          }
          break;

        case PriorityTypes.BUSYTIME:
          let isBusyCombination = false; // All combinations comply with busyTime until proven otherwise
          for (const currentCommission of combination.subjects) {
            for (const currentTime of currentCommission.commissionTimes) {
              const superposition = this.getSuperposition(currentTime, currentPriority.value);
              if (superposition > 0.0) {
                isBusyCombination = true; // Combination does not comply with priority
                break;
              }
            }
            if (isBusyCombination) {
              if (currentPriority.isExclusive()) {return false; } // Exclusive condition failed verify
              break;
            }
          }
          if (!isBusyCombination) { // If we do not find commissions on busyTime, we add priority{
            combination.priorities.push(Number(index));
          }
          break;

        case PriorityTypes.LOCATION:
          let hasPriorityLocation = false; // We assume there is no prioritized teacher to begin
          for (const currentCommission of combination.subjects) {
            if (currentCommission.code === currentPriority.relatedSubjectCode) {
              for (const currentTimeblock of currentCommission.commissionTimes) {
                if (currentTimeblock.building !== currentPriority.value) {
                  continue;
                }
                combination.priorities.push(Number(index));
                hasPriorityLocation = true;
              }
            }
          }
          if (currentPriority.isExclusive() && !hasPriorityLocation) {return false; } // Exclusive condition failed verify
          break;

        case PriorityTypes.TRAVEL:
          let tooFar = false; // We assume our combination works with realistic time-distances until the contrary is proved
          for (let i = 0; i < combination.subjects.length; i++) {
            if (tooFar) {break; } // optimization line. Can be removed.
            for (let j = i + 1; j < combination.subjects.length; j++) {
              for (const currentTime1 of combination.subjects[i].commissionTimes) {
                for (const currentTime2 of combination.subjects[j].commissionTimes) {
                  if (currentTime1.building !== currentTime2.building) { // Classes are in different buildings... can i get there in time?
                    const travelTime = this.getTravelTime(currentTime1, currentTime2);
                    if (travelTime > currentPriority.value) { // I don't want to travel from Parque patricios to Madero 6PM in 1 hour
                      tooFar = true; // TODO: implement calculator for travel time between two buildings
                    }
                  }
                }
              }
            }
          }
          if (!tooFar) {
            combination.priorities.push(Number(index));
          }
          break;
      }
    }
    return true;
  }

  private getTravelTime(schedule1, schedule2) {
    if (schedule1.day !== schedule2.day) {
      return 0.0;
    }
    return 1.0; // TODO implement minimum travel time
  }

  /**
   * Generates a list of all possible combinations, ordered by their weights which is calculated
   * by the weightAlgorithm according to the user's priorities.
   * @param subjects          List of all subjects
   * @param selectedSubjects  List of subjects selected
   * @param priorities        List of user's priorities
   */
  public schedulerAlgorithm(subjects: ISubject[], selectedSubjects: ISubjectSelection[], priorities: IPriority[], sort: string = 'sort') {
        // 1°, run the combination algorithm to obtain all possible schedules and classify them by the criteria and priorities
        const chosenSubjects: ISubject[] = [];
        for (const selectedSubject of selectedSubjects) {
            const subject = subjects.find(element => element.code === selectedSubject.code);
            if (subject) {
              chosenSubjects.push(subject);
            }
        }
        const verifier = (combination: ICombination) => this.verifiesPriorities(combination, priorities);
        let combinations = this.searchCombinations(chosenSubjects, verifier);

        // 2°, compute for every combination its weight, starting with a simple linear transformation... could be changed!
        function transformation(value: number) {
          return value;
        }

        for (const combination of combinations) {
          this.computeWeight(combination, priorities, selectedSubjects, transformation);
        }

        // 3°, run an ordering algorithm based on the previously calculated weight
        switch (sort) {
          case 'sort':
            combinations.sort(
              (a, b) => b.weight - a.weight
            );
            break;
          case 'quicksort':
            combinations = this.quicksort(
                combinations,
                0, combinations.length - 1,
                (combination: ICombination) => combination.weight,
                (current: number, pivot: number) => current < pivot
            );
            break;
        }

        // 4°, return the result
        return combinations;
  }

  public quicksort(
    array: Array<any>,
    left: number,
    right: number,
    get = (element) => element,
    condition = (current, pivot) => current > pivot) {

    function swap(list: Array<any>, one: number, two: number): void {
        const auxiliar = list[one];
        list[one] = array[two];
        list[two] = auxiliar;
    }

    function partition(list: Array<any>, leftIndex: number, rightIndex: number, pivot: number): number {
        let partitionIndex = pivot;
        const pivotValue = get(list[pivot]);
        for (let i = leftIndex ; i <= rightIndex ; i++) {
            const currentValue = get(list[i]);
            if ( condition(currentValue, pivotValue) ) {
                while (partitionIndex > i) {
                    partitionIndex -= 1;
                    const swapingValue = get(list[partitionIndex]);
                    if ( !condition(swapingValue, pivotValue) ) {
                        swap(list, i, partitionIndex);
                        break;
                    }
                }

                if (partitionIndex <= i) {
                    swap(list, pivot, partitionIndex);
                    break;
                }
            }
        }

        return partitionIndex;
    }

    const interval: Array<Array<number>> = [[left, right]];
    do {
      const iterInterval = interval.shift();
      const iterLeft = iterInterval[0];
      const iterRight = iterInterval[1];

      if (iterLeft < iterRight) {
          // Choose a pivot value and creates both partitions of the array, ordering with the given condition
          const partitionIndex = partition(array, iterLeft, iterRight, iterRight);

          // Swaps the partition and the pivot values
          interval.push([iterLeft, partitionIndex - 1]);
          interval.push([partitionIndex + 1, iterRight]);
      }
    } while (interval.length > 0);

    return array;
  }
}
